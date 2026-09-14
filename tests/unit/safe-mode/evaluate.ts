/** Opt-in offline spike. External packages must be installed separately in a temp directory.
 * bun tests/unit/safe-mode/evaluate.ts <temporary-install-root> [--record]
 * Never imported by application code or regular test entry points; never executes SQL.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cpus, platform, release, arch } from "node:os";
import { resolve } from "node:path";
import { corpus } from "./corpus";
import { DIALECTS, type Dialect } from "./model";
import { observe, type Candidate } from "./observe";
import { analyzeQuery } from "@/lib/db/utils/query-limiter";
import { inspectAgentStatement } from "@/lib/db/operations/statement-guard";
import { resolveSqlGrammar } from "@/lib/sql/grammar";
import { readOperativeKeyword } from "@/lib/sql/operative-keyword";
import { splitStatements } from "@/lib/sql/statement-splitter";

const root = process.argv[2];
if (!root) throw new Error("Provide an isolated temporary install root; no automatic installation is performed");
const external = createRequire(resolve(root, "package.json"));
const packages = [
  ["node-sql-parser", "5.4.0"],
  ["pgsql-ast-parser", "12.0.2"],
] as const;
for (const [name, version] of packages) {
  if (external(`${name}/package.json`).version !== version)
    throw new Error(`Expected ${name}@${version}; review corpus evidence before changing version`);
}
const started = performance.now();
const parser = new (external("node-sql-parser").Parser)();
const nodeLoadMs = performance.now() - started;
const pgStarted = performance.now();
const pg = external("pgsql-ast-parser");
const pgLoadMs = performance.now() - pgStarted;
const database: Record<Dialect, string> = { postgres: "Postgresql", mysql: "MySQL", sqlite: "Sqlite" };
const candidates: Candidate[] = [
  {
    name: "node-sql-parser",
    version: "5.4.0",
    dialects: DIALECTS,
    parse: (sql, dialect) => parser.astify(sql, { database: database[dialect] }),
  },
  { name: "pgsql-ast-parser", version: "12.0.2", dialects: ["postgres"], parse: (sql) => pg.parse(sql) },
];

const evaluations = candidates.map((candidate) => {
  const observations = corpus.map((item) => observe(candidate, item));
  const coverage = DIALECTS.map((dialect) => {
    const cases = corpus.filter((item) => item.dialect === dialect);
    const ids = new Set(cases.map((item) => item.id));
    const validIds = new Set(cases.filter((item) => item.syntax === "valid").map((item) => item.id));
    const invalidIds = new Set(cases.filter((item) => item.syntax === "invalid").map((item) => item.id));
    const rows = observations.filter((item) => ids.has(item.id));
    return {
      dialect,
      total: cases.length,
      valid: validIds.size,
      invalid: invalidIds.size,
      parsedValid: rows.filter((item) => validIds.has(item.id) && item.outcome === "parsed").length,
      rejectedValid: rows
        .filter((item) => validIds.has(item.id) && item.outcome === "parse-rejected")
        .map((item) => item.id),
      acceptedInvalid: rows
        .filter((item) => invalidIds.has(item.id) && item.outcome === "parsed")
        .map((item) => item.id),
      projectionMatches: rows.filter(
        (item) =>
          validIds.has(item.id) &&
          item.comparison?.operations &&
          item.comparison.whereOwnership &&
          item.comparison.topLevelCount,
      ).length,
      parsedMissingWrite: rows
        .filter((item) => validIds.has(item.id) && item.comparison?.missingWrite)
        .map((item) => item.id),
    };
  });
  return { name: candidate.name, version: candidate.version, coverage, observations };
});

const workloads = [
  { name: "short", sql: "SELECT id FROM users WHERE id=1;", iterations: 200 },
  { name: "50-statements", sql: Array.from({ length: 50 }, (_, i) => `SELECT ${i} AS id;`).join("\n"), iterations: 30 },
  {
    name: "large-in-list",
    sql: `SELECT id FROM users WHERE id IN (${Array.from({ length: 5000 }, (_, i) => i).join(",")});`,
    iterations: 5,
  },
];
const benchmarks: Array<Record<string, string | number>> = [];
for (const candidate of candidates) {
  for (const dialect of candidate.dialects) {
    for (const workload of workloads) {
      for (let i = 0; i < 3; i++) candidate.parse(workload.sql, dialect);
      const times: number[] = [];
      for (let i = 0; i < workload.iterations; i++) {
        const start = performance.now();
        candidate.parse(workload.sql, dialect);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      benchmarks.push({
        candidate: candidate.name,
        dialect,
        workload: workload.name,
        bytes: Buffer.byteLength(workload.sql),
        iterations: workload.iterations,
        medianMs: Number(times[Math.floor(times.length / 2)].toFixed(3)),
        p95Ms: Number(times[Math.min(times.length - 1, Math.floor(times.length * 0.95))].toFixed(3)),
      });
    }
  }
}

const existing = corpus
  .filter((item) => item.dialect !== "unsupported-engine")
  .map((item) => {
    const dialect = item.dialect as Dialect;
    const grammar = resolveSqlGrammar(dialect);
    return {
      id: item.id,
      limiterType: analyzeQuery(item.sql, dialect).type,
      operativeKeyword: readOperativeKeyword(item.sql, grammar)?.keyword ?? null,
      fragments: splitStatements(item.sql, grammar).length,
      agentViolation: inspectAgentStatement(item.sql),
    };
  });
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseline: "1eedccf752790b565adad2ae069158e7a1e1f700",
  corpusSha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
  corpusCount: corpus.length,
  environment: {
    runtime: `Bun ${Bun.version}`,
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
  },
  loadMs: { "node-sql-parser": Number(nodeLoadMs.toFixed(3)), "pgsql-ast-parser": Number(pgLoadMs.toFixed(3)) },
  caveat:
    "Acceptance and small AST projections are NOT a safe classifier, database validation, or proof of effect completeness. No SQL executed. Timing is warm in-process parsing only.",
  evaluations,
  benchmarks,
  existing,
};
if (process.argv.includes("--record")) {
  // One observation per line keeps the versioned evidence reviewable without
  // dropping failed cases or expanding hundreds of small records into 10k lines.
  const { evaluations: reports, benchmarks: timings, existing: utilities, ...header } = result;
  const lines = JSON.stringify(header, null, 2).slice(0, -2);
  const reportsJson = reports
    .map(
      ({ observations, ...metadata }) =>
        `${JSON.stringify(metadata, null, 2).slice(0, -2)},\n"observations": [\n${observations.map((item) => JSON.stringify(item)).join(",\n")}\n]}`,
    )
    .join(",\n");
  const serialized = `${lines},\n"evaluations": [\n${reportsJson}\n],\n"benchmarks": [\n${timings.map((item) => JSON.stringify(item)).join(",\n")}\n],\n"existing": [\n${utilities.map((item) => JSON.stringify(item)).join(",\n")}\n]\n}\n`;
  // Validate the serializer before replacing recorded evidence.
  JSON.parse(serialized);
  await Bun.write(new URL("./evaluation-results.json", import.meta.url), serialized);
}
console.log(
  JSON.stringify(
    {
      corpusCount: result.corpusCount,
      environment: result.environment,
      loadMs: result.loadMs,
      coverage: evaluations.map(({ name, coverage }) => ({ name, coverage })),
      benchmarks,
    },
    null,
    2,
  ),
);
