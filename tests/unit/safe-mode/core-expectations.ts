import type { ClassificationStatus } from "@/lib/safe-mode/types";
import type { SqlCase } from "./model";

/** 6B.1b expectations are separate from the historical parser oracle/fingerprint. */
const completeCommon = new Set([
  "select-one",
  "select-table",
  "insert-values",
  "update-where",
  "update-all",
  "delete-where",
  "delete-all",
  "where-true",
  "where-tautology",
  "update-string-where",
  "delete-comment-where",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "release",
  "mixed-batch",
  "batch-with-string-semicolon",
  "comment-keyword",
  "block-comment-keyword",
  "string-drop",
  "string-delete",
  "string-escaped-quote",
  "mixed-case",
  "cte-read",
  "cte-nested-read",
  "cte-literal-write",
  "identifier",
]);
const completeSpecific: Record<string, string[]> = {
  postgres: [
    "start-transaction",
    "delete-returning-where",
    "dollar-string",
    "tagged-dollar",
    "nested-comment",
    "cte-delete",
    "cte-update",
    "cte-nested-with-write",
    "explain-estimate-select",
    "explain-estimate-delete",
    "explain-analyze-select",
    "explain-analyze-delete",
  ],
  mysql: ["start-transaction", "double-string", "hash-comment", "explain-estimate-select", "explain-analyze-select"],
  sqlite: ["returning", "insert-returning", "update-returning", "explain-estimate-select"],
};
const unknown = new Set([
  "incomplete-select",
  "incomplete-cte",
  "unterminated-string",
  "unterminated-comment",
  "malformed-cte",
  "invalid-hash-comment",
  "unknown",
]);
export function expectedCoreStatus(c: SqlCase): ClassificationStatus {
  const id = c.id.split("/")[1];
  if (c.dialect === "unsupported-engine" || id === "exec" || c.id === "sqlite/invalid-truncate") return "unsupported";
  if (unknown.has(id)) return "unknown";
  if (completeCommon.has(id) || completeSpecific[c.dialect]?.includes(id)) return "classified";
  // These cases retain operation evidence, but their entire syntax/effects are not validated.
  return "partial";
}

export function isCriticalCase(c: SqlCase): boolean {
  return (
    c.expected.aggregateEffects.some((effect) =>
      ["write", "schema", "privilege", "maintenance", "control", "indirect"].includes(effect),
    ) || ["exec", "malformed-cte", "invalid-modifying-cte", "invalid-truncate"].includes(c.id.split("/")[1])
  );
}
