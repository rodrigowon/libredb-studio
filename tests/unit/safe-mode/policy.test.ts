import { describe, expect, test } from "bun:test";
import { evaluatePolicy } from "@/lib/safe-mode/policy";
import { classifySql } from "@/lib/safe-mode/classify";
import type { EffectiveEnvironment } from "@/lib/safe-mode/policy-types";
import { classification, environments, matrix, rank, statement } from "./policy-fixtures";

describe("approved complete-evidence matrix (NOT claims of classifier grammar coverage)", () => {
  for (const row of matrix)
    for (const [index, env] of environments.entries())
      test(`${row.name} / ${env}`, () => {
        const r = evaluatePolicy({ classification: classification([row.input]), effectiveEnvironment: env });
        expect(rank(r)).toBe(row.levels[index]);
        expect(r.reasonCodes).toContain(row.reason);
        expect(r.policyVersion).toBe(1);
        expect(r.aggregateDecision).toBe(r.decision);
        expect(r.statementDecisions).toHaveLength(1);
        expect(r.confirmationLevel !== undefined).toBe(r.decision === "require_confirmation");
      });
});

describe("uncertainty and environment monotonicity", () => {
  for (const row of matrix)
    test(row.name, () => {
      let previous = -1;
      for (const env of environments) {
        const original = classification([row.input]);
        const base = evaluatePolicy({ classification: original, effectiveEnvironment: env });
        expect(rank(base)).toBeGreaterThanOrEqual(previous);
        previous = rank(base);
        for (const status of ["partial", "unknown", "unsupported", "invalid"] as const) {
          for (const changed of [{ ...original, status }, classification([{ ...row.input, status }])])
            expect(rank(evaluatePolicy({ classification: changed, effectiveEnvironment: env }))).toBeGreaterThanOrEqual(
              rank(base),
            );
        }
        const unknownEffects = classification([
          {
            ...row.input,
            effects: [...row.input.effects, "unknown-effects"],
            aggregateEffects: [...row.input.aggregateEffects, "unknown-effects"],
          },
        ]);
        expect(
          rank(evaluatePolicy({ classification: unknownEffects, effectiveEnvironment: env })),
        ).toBeGreaterThanOrEqual(rank(base));
        const topUnknown = {
          ...original,
          aggregateEffects: [...original.aggregateEffects, "unknown-effects" as const],
        };
        expect(rank(evaluatePolicy({ classification: topUnknown, effectiveEnvironment: env }))).toBeGreaterThanOrEqual(
          rank(base),
        );
      }
    });
  for (const status of ["unknown", "unsupported", "invalid"] as const)
    for (const [i, env] of environments.entries())
      test(`${status} floor ${env}`, () => {
        const c = classification([], { status, aggregateEffects: ["unknown-effects"], certainty: "incomplete" });
        expect(rank(evaluatePolicy({ classification: c, effectiveEnvironment: env }))).toBe([1, 2, 4, 4][i]);
      });
  for (const value of ["other", "custom", "unknown", "PROD", "", undefined, null])
    test(`environment does not silently become local: ${value}`, () => {
      const c = classification([statement("delete", "write", { hasWhere: false })]);
      const r = evaluatePolicy({ classification: c, effectiveEnvironment: value as EffectiveEnvironment });
      expect(r.profile).toBe("conservative");
      expect(r.decision).toBe("block");
      expect(r.effectiveEnvironment).toBe("other");
    });
  test("limit result is consumed, not parsed again", () => {
    const c = classification([], {
      status: "unknown",
      certainty: "incomplete",
      limitations: ["limit-exceeded:tokens"],
    });
    const r = evaluatePolicy({ classification: c, effectiveEnvironment: "production" });
    expect(r.decision).toBe("block");
    expect(r.reasonCodes).toContain("LIMIT_EXCEEDED");
    expect(r.analysisLimitations).toContain("limit-exceeded:tokens");
  });
});

describe("batch and child execution edges", () => {
  for (const env of environments)
    for (const row of matrix)
      test(`batch max ${row.name} ${env}`, () => {
        const read = statement("select", "read");
        const solo = evaluatePolicy({ classification: classification([row.input]), effectiveEnvironment: env });
        for (const items of [
          [read, row.input],
          [row.input, read],
          [read, row.input, read],
        ]) {
          const batch = evaluatePolicy({ classification: classification(items), effectiveEnvironment: env });
          expect(rank(batch)).toBe(rank(solo));
          expect(batch.reasonCodes).toContain("MULTI_STATEMENT");
          expect(batch.statementDecisions.map((s) => s.operation)).toEqual(items.map((s) => s.operation));
        }
      });
  for (const sql of [
    "SELECT 1; FUTURE x",
    "SELECT 1; DELETE FROM t",
    "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
    "EXPLAIN ANALYZE DELETE FROM t",
  ])
    test(`production execution effects: ${sql}`, () => {
      const c = classifySql({ sql, dialect: "postgres" });
      expect(evaluatePolicy({ classification: c, effectiveEnvironment: "production" }).decision).toBe("block");
    });
  test("estimate does not execute underlying DELETE; analyze does", () => {
    for (const env of environments) {
      const estimate = classifySql({ sql: "EXPLAIN DELETE FROM t", dialect: "postgres" });
      const r = evaluatePolicy({ classification: estimate, effectiveEnvironment: env });
      expect(r.decision).toBe("allow");
      expect(r.risk).toBe("low");
      expect(r.statementDecisions[0].children[0].execution).toBe("not-executed");
      const analyze = classifySql({ sql: "EXPLAIN ANALYZE SELECT * FROM t", dialect: "postgres" });
      const a = evaluatePolicy({ classification: analyze, effectiveEnvironment: env });
      expect(rank(a)).toBe(env === "staging" || env === "production" ? 2 : 1);
      expect(a.reasonCodes).toContain("EXPLAIN_ANALYZE");
    }
  });
  test("uncertain planning children never acquire certainty via estimate", () => {
    const child = statement("select", "read", { aggregateEffects: ["read", "unknown-effects"] });
    const explain = statement("explain", "read", {
      children: [child],
      explainMode: "estimate",
      executesChildren: false,
    });
    expect(
      evaluatePolicy({ classification: classification([explain]), effectiveEnvironment: "production" }).decision,
    ).toBe("block");
  });
  test("false execution flags cannot hide a CTE write or ANALYZE", () => {
    for (const op of ["select", "explain"]) {
      const s = statement(op, "read", {
        children: [statement("delete", "write", { hasWhere: false })],
        explainMode: "analyze",
        executesChildren: false,
      });
      expect(evaluatePolicy({ classification: classification([s]), effectiveEnvironment: "production" }).decision).toBe(
        "block",
      );
    }
  });
});

describe("purity, stable reasons and no bypass", () => {
  test("SQL and parameter values are not consulted", () => {
    const c = classification([statement("select", "read")]);
    for (const key of ["originalSql", "effectiveSql", "parameters"])
      Object.defineProperty(c, key, {
        get() {
          throw new Error("SQL/params accessed");
        },
      });
    Object.defineProperty(c.statements[0], "sql", {
      get() {
        throw new Error("statement SQL accessed");
      },
    });
    expect(evaluatePolicy({ classification: c, effectiveEnvironment: "production" }).decision).toBe("allow");
  });
  test("same input unchanged, stable deduplicated reasons and limitations", () => {
    const c = classifySql({
      sql: "WITH x AS (DELETE FROM t RETURNING *) SELECT f() FROM x; DROP DATABASE t",
      dialect: "postgres",
    });
    const before = JSON.stringify(c);
    const input = { classification: c, effectiveEnvironment: "production" as const };
    const r = evaluatePolicy(input);
    expect(r).toEqual(evaluatePolicy(input));
    expect(JSON.stringify(c)).toBe(before);
    expect(r.reasonCodes).toEqual([...new Set(r.reasonCodes)].sort());
    expect(r.analysisLimitations).toEqual([...new Set(r.analysisLimitations)].sort());
    const reversed = evaluatePolicy({ ...input, classification: { ...c, statements: [...c.statements].reverse() } });
    expect(reversed.reasonCodes).toEqual(r.reasonCodes);
    expect(reversed.decision).toBe(r.decision);
  });
  test("an extra admin property cannot bypass protection", () => {
    const input = {
      classification: classifySql({ sql: "DELETE FROM t", dialect: "postgres" }),
      effectiveEnvironment: "production" as const,
      actorRole: "admin",
    };
    expect(evaluatePolicy(input).decision).toBe("block");
  });
  test("risk is distinct from action", () => {
    const r = evaluatePolicy({
      classification: classification([statement("update", "write", { hasWhere: true })]),
      effectiveEnvironment: "production",
    });
    expect(r).toMatchObject({ risk: "high", decision: "require_confirmation", confirmationLevel: "standard" });
    const b = evaluatePolicy({
      classification: classification([statement("drop-database", "schema")]),
      effectiveEnvironment: "production",
    });
    expect(b).toMatchObject({ risk: "critical", decision: "block" });
    expect(b).not.toHaveProperty("confirmationLevel");
  });
});
