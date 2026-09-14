import { describe, expect, test } from "bun:test";
import { corpus } from "./corpus";
import { observe, type Candidate } from "./observe";
import evidence from "./evaluation-results.json";

describe("experimental observation harness, not an enforcement adapter", () => {
  test("parse failure carries no AST-derived read/classification/fallback", () => {
    const candidate: Candidate = {
      name: "test",
      version: "test",
      dialects: ["postgres"],
      parse: () => {
        throw new Error("unsupported SQL");
      },
    };
    expect(observe(candidate, corpus[0])).toEqual({
      id: corpus[0].id,
      outcome: "parse-rejected",
      error: "unsupported SQL",
    });
  });
  test("unsupported dialect never calls PostgreSQL parser", () => {
    let calls = 0;
    const candidate: Candidate = {
      name: "test",
      version: "test",
      dialects: ["postgres"],
      parse: () => {
        calls++;
        return [];
      },
    };
    for (const item of corpus.filter((item) => item.dialect !== "postgres"))
      expect(observe(candidate, item).outcome).toBe("unsupported");
    expect(calls).toBe(0);
  });
  test("own WHERE is inspected, not a WHERE nested in a value expression", () => {
    const item = corpus.find((entry) => entry.id === "postgres/update-subquery-where")!;
    const candidate: Candidate = {
      name: "test",
      version: "test",
      dialects: ["postgres"],
      parse: () => [{ type: "update", where: null, value: { type: "select", where: { value: true } } }],
    };
    const result = observe(candidate, item);
    expect(result.nodes?.[0].hasWhere).toBe(false);
    expect(result.comparison?.whereOwnership).toBe(true);
  });
  test("evidence pins the candidate's dangerous MySQL omissions rather than calling acceptance coverage", () => {
    const candidate = evidence.evaluations.find((item) => item.name === "node-sql-parser")!;
    for (const id of ["mysql/executable-comment", "mysql/dash-not-comment"]) {
      const result = candidate.observations.find((item) => item.id === id)!;
      expect(result.outcome).toBe("parsed");
      expect(result.comparison).toMatchObject({ missingWrite: true, topLevelCount: false });
    }
  });
  test("evidence pins dialect-invalid acceptance and PG unterminated comment acceptance", () => {
    const node = evidence.evaluations.find((item) => item.name === "node-sql-parser")!;
    expect(node.coverage.find((item) => item.dialect === "sqlite")?.acceptedInvalid).toContain(
      "sqlite/invalid-truncate",
    );
    const pg = evidence.evaluations.find((item) => item.name === "pgsql-ast-parser")!;
    expect(pg.coverage[0].acceptedInvalid).toContain("postgres/unterminated-comment");
  });
});
