import { describe, expect, test } from "bun:test";
import { isDangerousQuery } from "@/components/QuerySafetyDialog";
import { analyzeQuery } from "@/lib/db/utils/query-limiter";
import { inspectAgentStatement } from "@/lib/db/operations/statement-guard";
import { resolveSqlGrammar } from "@/lib/sql/grammar";
import { splitStatements } from "@/lib/sql/statement-splitter";
import { corpus } from "./corpus";

const get = (id: string) => corpus.find((item) => item.id === id)!.sql;

describe("existing utility limitations characterized, NOT adopted for Safe Mode", () => {
  test("limiter's SELECT shape does not imply no write or one valid statement", () => {
    for (const id of ["cte-delete", "cte-update", "mixed-batch", "function", "incomplete-select"]) {
      expect(analyzeQuery(get(`postgres/${id}`), "postgres").type).toBe("SELECT");
    }
  });
  test("Query Safety misses DELETE CTE/function/INSERT, detects UPDATE CTE and mixed batch", () => {
    for (const id of ["cte-delete", "function", "insert-values"])
      expect(isDangerousQuery(get(`postgres/${id}`), "postgres")).toBe(false);
    for (const id of ["cte-update", "mixed-batch"])
      expect(isDangerousQuery(get(`postgres/${id}`), "postgres")).toBe(true);
  });
  test("Query Safety does not infer writes from inert strings/comments", () => {
    for (const id of ["string-delete", "string-drop", "comment-keyword", "dollar-string"])
      expect(isDangerousQuery(get(`postgres/${id}`), "postgres")).toBe(false);
  });
  test("Agent guard catches CTE DML but null does not prove function purity or syntax validity", () => {
    expect(inspectAgentStatement(get("postgres/cte-delete"))).toBe("SIDE_EFFECT_KEYWORD");
    expect(inspectAgentStatement(get("postgres/cte-update"))).toBe("SIDE_EFFECT_KEYWORD");
    expect(inspectAgentStatement(get("postgres/function"))).toBeNull();
    expect(inspectAgentStatement("SELECT gibberish nonsense more_nonsense")).toBeNull();
    expect(inspectAgentStatement(get("postgres/dollar-string"))).toBe("DIALECT_AMBIGUOUS_TEXT");
  });
  test("MySQL executable comment and no-space dash cases are not authorization-safe", () => {
    for (const id of ["executable-comment", "dash-not-comment"])
      expect(isDangerousQuery(get(`mysql/${id}`), "mysql")).toBe(false);
    expect(splitStatements(get("mysql/dash-not-comment"), resolveSqlGrammar("mysql"))).toHaveLength(1);
  });
});
