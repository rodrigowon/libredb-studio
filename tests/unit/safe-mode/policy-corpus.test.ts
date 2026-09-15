import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { classifySql } from "@/lib/safe-mode/classify";
import { evaluatePolicy } from "@/lib/safe-mode/policy";
import { corpus } from "./corpus";
import { isCriticalCase } from "./core-expectations";
import { environments, rank } from "./policy-fixtures";
import type { StatementExpectation } from "./model";
import evidence from "./policy-evaluation-results.json";

/** Independent approved-matrix floor, not obtained from production policy rules. */
export function productionFloor(s: StatementExpectation): number {
  const childFloor = s.executesChildren === false ? 0 : Math.max(0, ...(s.children ?? []).map(productionFloor));
  let own = 0;
  if (s.category === "write")
    own = s.operation === "insert" ? 1 : ["update", "delete"].includes(s.operation) ? (s.hasWhere === true ? 2 : 4) : 2;
  if (s.category === "schema")
    own =
      s.operation === "drop-database"
        ? 4
        : ["drop-table", "truncate-table", "alter-table"].includes(s.operation)
          ? 3
          : 2;
  if (s.category === "privilege") own = 3;
  if (s.category === "maintenance")
    own = ["reindex", "vacuum-full"].includes(s.operation) ? 3 : s.operation === "vacuum" ? 2 : 1;
  if (s.category === "control") own = ["pragma", "attach", "detach"].includes(s.operation) ? 4 : 2;
  if (s.category === "indirect") own = 4;
  if (s.effects.includes("unknown-effects")) own = 4;
  if (s.effects.includes("write") && own === 0) own = 2;
  if (s.explainMode === "analyze") own = Math.max(own, 2);
  return Math.max(own, childFloor);
}

test("the exact 132 historical critical cases are included", () => {
  expect(corpus).toHaveLength(221);
  expect(corpus.filter(isCriticalCase)).toHaveLength(132);
});
test("recorded distribution and all 884 outcomes match current policy", () => {
  expect(evidence.corpusSha256).toBe(createHash("sha256").update(JSON.stringify(corpus)).digest("hex"));
  expect(evidence.observations).toHaveLength(884);
  expect(evidence.productionCritical).toEqual({ total: 132, permissive: 0 });
  for (const env of environments) {
    const decisions = corpus.map((c) => {
      const r = evaluatePolicy({
        classification: classifySql({ sql: c.sql, dialect: c.dialect }),
        effectiveEnvironment: env,
      });
      const recorded = evidence.observations.find((o) => o.id === c.id && o.environment === env)!;
      expect(recorded.decision).toBe(r.decision);
      expect(recorded.confirmationLevel).toBe(r.confirmationLevel ?? null);
      expect(recorded.reasonCodes).toEqual(r.reasonCodes);
      return r;
    });
    const recordedCounts = evidence.byEnvironment[env as keyof typeof evidence.byEnvironment];
    for (const action of ["allow", "warn", "require_confirmation", "block"] as const) {
      expect(recordedCounts[action]).toBe(decisions.filter((d) => d.decision === action).length);
    }
  }
});
for (const c of corpus)
  test(`classifier -> policy: ${c.id}`, () => {
    const classified = classifySql({ sql: c.sql, dialect: c.dialect });
    let previous = -1;
    for (const env of environments) {
      const r = evaluatePolicy({ classification: classified, effectiveEnvironment: env });
      expect(rank(r)).toBeGreaterThanOrEqual(previous);
      previous = rank(r);
      expect(r.statementDecisions).toHaveLength(classified.statements.length);
      expect(r.reasonCodes).toEqual([...new Set(r.reasonCodes)].sort());
      if (env === "production") {
        if (isCriticalCase(c)) expect(r.decision).not.toBe("allow");
        expect(rank(r)).toBeGreaterThanOrEqual(Math.max(0, ...c.expected.statements.map(productionFloor)));
        if (classified.status !== "classified" || classified.aggregateEffects.includes("unknown-effects"))
          expect(r.decision).toBe("block");
      }
    }
  });
