import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { classifySql } from "@/lib/safe-mode/classify";
import type { ClassifiedStatement } from "@/lib/safe-mode/types";
import { corpus } from "./corpus";
import { expectedCoreStatus, isCriticalCase } from "./core-expectations";
import recorded from "./core-evaluation-results.json";

const flatten = (items: ClassifiedStatement[]): ClassifiedStatement[] =>
  items.flatMap((s) => [s, ...flatten(s.children)]);

describe("production core over the unchanged 221-case specification", () => {
  test("recorded coverage is current and preserves the historical corpus fingerprint", () => {
    expect(recorded.corpusSha256).toBe(createHash("sha256").update(JSON.stringify(corpus)).digest("hex"));
    expect(recorded.observations).toHaveLength(corpus.length);
    for (const c of corpus) {
      const r = classifySql({ sql: c.sql, dialect: c.dialect });
      const observation = recorded.observations.find((o) => o.id === c.id)!;
      expect(observation.status).toBe(r.status);
      expect(observation.aggregateEffects).toEqual(r.aggregateEffects);
      expect(observation.operations).toEqual(r.statements.map((s) => s.operation));
      expect(observation.critical).toBe(isCriticalCase(c));
    }
    expect(recorded.totals.criticalFalseReads).toBe(0);
    expect(recorded.totals.validCasesMissingEffects).toBe(0);
  });
  test("corpus size and non-empty critical group", () => {
    expect(corpus).toHaveLength(221);
    expect(corpus.filter(isCriticalCase).length).toBeGreaterThan(100);
    expect(corpus.filter((c) => c.source)).toHaveLength(9);
  });
  for (const c of corpus)
    test(c.id, () => {
      const result = classifySql({ sql: c.sql, dialect: c.dialect });
      expect(result.status).toBe(expectedCoreStatus(c));
      expect(result.effectiveSql).toBe(c.sql);
      expect(result.originalSql).toBe(c.sql);
      expect(result.scopeIsSafe).toBe("not-proven");
      if (isCriticalCase(c)) expect(result.aggregateEffects).not.toEqual(["read"]);
      if (c.syntax === "invalid") expect(result.status).not.toBe("classified");
      if (c.syntax === "valid" && c.expected.statements.length) {
        expect(result.statements.map((s) => s.operation)).toEqual(c.expected.statements.map((s) => s.operation));
        for (const effect of c.expected.aggregateEffects) expect(result.aggregateEffects).toContain(effect);
      }
      for (const s of flatten(result.statements)) {
        expect(s.sql).toBe(c.sql.slice(s.start, s.end));
        expect(s.scopeIsSafe).toBe("not-proven");
        if (s.children.some((child) => child.status !== "classified")) expect(s.status).not.toBe("classified");
        // Non-executed EXPLAIN/view children retain evidence without charging it to the parent.
        if (s.effects.includes("write")) expect(s.aggregateEffects).toContain("write");
      }
      if (c.source) {
        expect(result.aggregateEffects).toContain("schema");
        expect(result.statements).toHaveLength(c.expected.statements.length);
      }
    });
});
