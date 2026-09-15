/** Offline policy coverage + benchmark. Classifications are prepared BEFORE timing. */
import { createHash } from "node:crypto";
import { cpus, release } from "node:os";
import { classifySql } from "@/lib/safe-mode/classify";
import { evaluatePolicy } from "@/lib/safe-mode/policy";
import { SAFE_MODE_POLICY_VERSION } from "@/lib/safe-mode/policy-rules";
import type { EffectiveEnvironment } from "@/lib/safe-mode/policy-types";
import { corpus } from "./corpus";
import { isCriticalCase } from "./core-expectations";

const environments: EffectiveEnvironment[] = ["local", "development", "staging", "production"];
const classified = corpus.map((c) => classifySql({ sql: c.sql, dialect: c.dialect }));
const observations = corpus.flatMap((c, index) =>
  environments.map((effectiveEnvironment) => {
    const r = evaluatePolicy({ classification: classified[index], effectiveEnvironment });
    return {
      id: c.id,
      dialect: c.dialect,
      syntax: c.syntax,
      classifierStatus: classified[index].status,
      environment: effectiveEnvironment,
      decision: r.decision,
      confirmationLevel: r.confirmationLevel ?? null,
      risk: r.risk,
      critical: isCriticalCase(c),
      reasonCodes: r.reasonCodes,
      expectedEffects: c.expected.aggregateEffects,
    };
  }),
);
function counts(rows: typeof observations) {
  return {
    total: rows.length,
    allow: rows.filter((r) => r.decision === "allow").length,
    warn: rows.filter((r) => r.decision === "warn").length,
    require_confirmation: rows.filter((r) => r.decision === "require_confirmation").length,
    standard: rows.filter((r) => r.confirmationLevel === "standard").length,
    strong: rows.filter((r) => r.confirmationLevel === "strong").length,
    block: rows.filter((r) => r.decision === "block").length,
  };
}
const production = observations.filter((r) => r.environment === "production");
const validBlocked = production.filter((r) => r.syntax === "valid" && r.decision === "block");
const countNodes = (items: (typeof classified)[number]["statements"]): number =>
  items.reduce((n, s) => n + 1 + countNodes(s.children), 0);
const largestIndex = classified.reduce(
  (best, c, i) => (countNodes(c.statements) > countNodes(classified[best].statements) ? i : best),
  0,
);
const samples = [
  { name: "simple-read", classification: classifySql({ sql: "SELECT 1", dialect: "postgres" }), iterations: 20_000 },
  {
    name: "50-statements",
    classification: classifySql({ sql: "SELECT 1; DELETE FROM t WHERE id=1;".repeat(25), dialect: "postgres" }),
    iterations: 2_000,
  },
  {
    name: `largest-corpus-tree:${corpus[largestIndex].id}`,
    classification: classified[largestIndex],
    iterations: 5_000,
  },
];
const benchmarks = samples.map((sample) => {
  const input = { classification: sample.classification, effectiveEnvironment: "production" as const };
  for (let i = 0; i < 100; i++) evaluatePolicy(input);
  const start = performance.now();
  for (let i = 0; i < sample.iterations; i++) evaluatePolicy(input);
  return {
    name: sample.name,
    nodes: countNodes(sample.classification.statements),
    iterations: sample.iterations,
    meanMs: Number(((performance.now() - start) / sample.iterations).toFixed(6)),
  };
});
const report = {
  phase: "6B.2",
  policyVersion: SAFE_MODE_POLICY_VERSION,
  corpusSha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
  runtime: {
    bun: Bun.version,
    node: process.version,
    platform: process.platform,
    release: release(),
    cpu: cpus()[0]?.model,
  },
  corpusCount: corpus.length,
  evaluations: observations.length,
  byEnvironment: Object.fromEntries(
    environments.map((env) => [env, counts(observations.filter((r) => r.environment === env))]),
  ),
  productionCritical: {
    total: production.filter((r) => r.critical).length,
    permissive: production.filter((r) => r.critical && r.decision === "allow").length,
  },
  validProductionBlocks: {
    total: validBlocked.length,
    byClassifierStatus: Object.fromEntries(
      ["classified", "partial", "unknown", "unsupported"].map((status) => [
        status,
        validBlocked.filter((r) => r.classifierStatus === status).length,
      ]),
    ),
    syntacticReadOnlyOracle: validBlocked
      .filter((r) => r.expectedEffects.length === 1 && r.expectedEffects[0] === "read")
      .map((r) => r.id),
    cases: validBlocked.map((r) => r.id),
  },
  benchmarks,
};
if (process.argv.includes("--record")) {
  await Bun.write(
    new URL("./policy-evaluation-results.json", import.meta.url),
    `${JSON.stringify(report, null, 2).slice(0, -2)},\n  "observations": [\n${observations.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`,
  );
}
console.log(JSON.stringify(report, null, 2));
if (report.productionCritical.permissive) process.exitCode = 1;
