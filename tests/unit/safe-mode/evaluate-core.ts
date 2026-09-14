/** Offline corpus evidence/benchmark. No SQL is ever sent to a database. */
import { createHash } from "node:crypto";
import { cpus, release } from "node:os";
import { classifySql } from "@/lib/safe-mode/classify";
import { SQL_CLASSIFICATION_LIMITS } from "@/lib/safe-mode/limits";
import type { SqlDialect } from "@/lib/safe-mode/types";
import { corpus } from "./corpus";
import { expectedCoreStatus, isCriticalCase } from "./core-expectations";

const observations = corpus.map((c) => {
  const r = classifySql({ sql: c.sql, dialect: c.dialect });
  const pureRead = r.aggregateEffects.length === 1 && r.aggregateEffects[0] === "read";
  const falseRead = pureRead && (isCriticalCase(c) || c.syntax === "invalid");
  // Potential effects in INVALID SQL are syntax evidence, not claimed executed effects.
  // Count them separately; do not dilute the valid-SQL precision denominator.
  const extra = r.aggregateEffects.filter(
    (e) => !["read", "unknown", "unknown-effects"].includes(e) && !c.expected.aggregateEffects.includes(e),
  );
  return {
    id: c.id,
    dialect: c.dialect,
    syntax: c.syntax,
    status: r.status,
    expectedStatus: expectedCoreStatus(c),
    critical: isCriticalCase(c),
    falseRead,
    falseEffects: c.syntax === "valid" ? extra : [],
    invalidPossibleEffects: c.syntax === "invalid" ? extra : [],
    missingEffects:
      c.syntax === "valid" ? c.expected.aggregateEffects.filter((e) => !r.aggregateEffects.includes(e)) : [],
    operations: r.statements.map((s) => s.operation),
    aggregateEffects: r.aggregateEffects,
    limitations: r.limitations,
  };
});
const metrics = (rows: typeof observations) => ({
  total: rows.length,
  classified: rows.filter((r) => r.status === "classified").length,
  partial: rows.filter((r) => r.status === "partial").length,
  unknown: rows.filter((r) => r.status === "unknown").length,
  invalid: rows.filter((r) => r.status === "invalid").length,
  unsupported: rows.filter((r) => r.status === "unsupported").length,
  critical: rows.filter((r) => r.critical).length,
  criticalFalseReads: rows.filter((r) => r.critical && r.falseRead).length,
  falseReads: rows.filter((r) => r.falseRead).length,
  validCasesWithExtraEffects: rows.filter((r) => r.falseEffects.length).length,
  invalidCasesWithPossibleEffects: rows.filter((r) => r.invalidPossibleEffects.length).length,
  validCasesMissingEffects: rows.filter((r) => r.missingEffects.length).length,
  dialectSpecificUnsupported: rows.filter((r) => r.status === "unsupported" && r.dialect !== "unsupported-engine")
    .length,
});
const samples = [
  { name: "simple", sql: "SELECT id FROM users WHERE id=1", iterations: 2_000 },
  { name: "50-statements", sql: "SELECT id FROM users WHERE id=1;\n".repeat(50), iterations: 200 },
  {
    name: "24KiB-values",
    sql: "INSERT INTO t(x) VALUES " + Array.from({ length: 300 }, () => `('${"x".repeat(75)}')`).join(",") + ";",
    iterations: 100,
  },
  {
    name: "near-code-unit-limit",
    sql: "SELECT '" + "x".repeat(SQL_CLASSIFICATION_LIMITS.sqlCodeUnits - 10) + "';",
    iterations: 100,
  },
  {
    name: "near-token-limit",
    sql: "INSERT INTO t(x) VALUES " + Array.from({ length: 8_180 }, () => "(1)").join(",") + ";",
    iterations: 30,
  },
];
const benchmarks = (["postgres", "mysql", "sqlite"] as SqlDialect[]).flatMap((dialect) =>
  samples.map((sample) => {
    for (let i = 0; i < 20; i++) classifySql({ sql: sample.sql, dialect });
    const started = performance.now();
    for (let i = 0; i < sample.iterations; i++) classifySql({ sql: sample.sql, dialect });
    return {
      dialect,
      name: sample.name,
      codeUnits: sample.sql.length,
      utf8Bytes: Buffer.byteLength(sample.sql),
      iterations: sample.iterations,
      meanMs: Number(((performance.now() - started) / sample.iterations).toFixed(4)),
      status: classifySql({ sql: sample.sql, dialect }).status,
    };
  }),
);
const report = {
  phase: "6B.1b",
  corpusSha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
  runtime: {
    bun: Bun.version,
    node: process.version,
    platform: process.platform,
    release: release(),
    cpu: cpus()[0]?.model,
  },
  limits: SQL_CLASSIFICATION_LIMITS,
  totals: metrics(observations),
  byDialect: Object.fromEntries(
    ["postgres", "mysql", "sqlite", "unsupported-engine"].map((d) => [
      d,
      metrics(observations.filter((r) => r.dialect === d)),
    ]),
  ),
  extraEffectCases: observations
    .filter((r) => r.falseEffects.length)
    .map((r) => ({ id: r.id, effects: r.falseEffects })),
  unsupportedCases: observations.filter((r) => r.status === "unsupported").map((r) => r.id),
  benchmarks,
};
if (process.argv.includes("--record")) {
  const header = JSON.stringify(report, null, 2).slice(0, -2);
  await Bun.write(
    new URL("./core-evaluation-results.json", import.meta.url),
    `${header},\n  "observations": [\n${observations.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`,
  );
}
console.log(JSON.stringify(report, null, 2));
if (observations.some((r) => r.falseRead || r.missingEffects.length || r.status !== r.expectedStatus))
  process.exitCode = 1;
