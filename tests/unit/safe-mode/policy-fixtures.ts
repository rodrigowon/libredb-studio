import type { ClassifiedStatement, SqlCategory, SqlClassification } from "@/lib/safe-mode/types";
import type { EffectiveEnvironment, PolicyOutcome } from "@/lib/safe-mode/policy-types";

export const environments: EffectiveEnvironment[] = ["local", "development", "staging", "production"];
/** Synthetic COMPLETE evidence tests the approved matrix independently of today's
 * deliberately partial DDL/maintenance classifier. Real SQL is tested separately.
 */
export function statement(
  operation: string,
  category: SqlCategory,
  extra: Partial<ClassifiedStatement> = {},
): ClassifiedStatement {
  return {
    status: "classified",
    operation,
    category,
    start: 0,
    end: 0,
    sql: "",
    effects: [category],
    aggregateEffects: [category],
    evidence: [],
    children: [],
    limitations: [],
    scopeIsSafe: "not-proven",
    ...extra,
  };
}
export function classification(
  statements: ClassifiedStatement[],
  extra: Partial<SqlClassification> = {},
): SqlClassification {
  return {
    status: "classified",
    dialect: "postgres",
    originalSql: "",
    effectiveSql: "",
    statements,
    aggregateEffects: [...new Set(statements.flatMap((s) => s.aggregateEffects))],
    limitations: [],
    certainty: "recognized-subset",
    scopeIsSafe: "not-proven",
    ...extra,
  };
}
export function rank(outcome: PolicyOutcome): number {
  return outcome.decision === "block"
    ? 4
    : outcome.decision === "require_confirmation"
      ? outcome.confirmationLevel === "strong"
        ? 3
        : 2
      : outcome.decision === "warn"
        ? 1
        : 0;
}
type MatrixRow = { name: string; input: ClassifiedStatement; levels: [number, number, number, number]; reason: string };
export const matrix: MatrixRow[] = [
  { name: "read", input: statement("select", "read"), levels: [0, 0, 0, 0], reason: "READ_OPERATION" },
  { name: "insert", input: statement("insert", "write"), levels: [0, 1, 1, 1], reason: "INSERT_OPERATION" },
  ...(["update", "delete"] as const).flatMap(
    (op) =>
      [
        {
          name: `${op}-where`,
          input: statement(op, "write", { hasWhere: true }),
          levels: [0, 1, 2, 2],
          reason: `${op.toUpperCase()}_WITH_WHERE`,
        },
        {
          name: `${op}-all`,
          input: statement(op, "write", { hasWhere: false }),
          levels: [1, 2, 4, 4],
          reason: `${op.toUpperCase()}_WITHOUT_WHERE`,
        },
        {
          name: `${op}-unknown`,
          input: statement(op, "write", { hasWhere: "unknown" }),
          levels: [1, 2, 4, 4],
          reason: `${op.toUpperCase()}_WHERE_UNKNOWN`,
        },
      ] as MatrixRow[],
  ),
  ...["create-table", "create-index", "create-view"].map(
    (op) =>
      ({ name: op, input: statement(op, "schema"), levels: [0, 1, 1, 2], reason: "CREATE_SCHEMA_OBJECT" }) as MatrixRow,
  ),
  { name: "alter", input: statement("alter-table", "schema"), levels: [1, 1, 2, 3], reason: "ALTER_TABLE" },
  { name: "drop-table", input: statement("drop-table", "schema"), levels: [1, 2, 3, 3], reason: "DROP_TABLE" },
  { name: "truncate", input: statement("truncate-table", "schema"), levels: [1, 2, 3, 3], reason: "TRUNCATE" },
  { name: "drop-database", input: statement("drop-database", "schema"), levels: [3, 4, 4, 4], reason: "DROP_DATABASE" },
  ...["drop-index", "drop-view"].map(
    (op) =>
      ({ name: op, input: statement(op, "schema"), levels: [1, 1, 2, 2], reason: "DROP_INDEX_OR_VIEW" }) as MatrixRow,
  ),
  ...["grant", "revoke"].map(
    (op) =>
      ({ name: op, input: statement(op, "privilege"), levels: [1, 2, 3, 3], reason: "PRIVILEGE_CHANGE" }) as MatrixRow,
  ),
  { name: "analyze", input: statement("analyze", "maintenance"), levels: [0, 0, 1, 1], reason: "ANALYZE" },
  { name: "vacuum", input: statement("vacuum", "maintenance"), levels: [0, 1, 1, 2], reason: "VACUUM" },
  { name: "vacuum-full", input: statement("vacuum-full", "maintenance"), levels: [1, 2, 3, 3], reason: "VACUUM_FULL" },
  { name: "reindex", input: statement("reindex", "maintenance"), levels: [1, 2, 2, 3], reason: "REINDEX" },
  ...["begin", "commit", "rollback", "savepoint", "release"].map(
    (op) =>
      ({
        name: op,
        input: statement(op, "transaction"),
        levels: [0, 0, 0, 0],
        reason: "TRANSACTION_CONTROL",
      }) as MatrixRow,
  ),
  { name: "set", input: statement("set", "control"), levels: [1, 1, 1, 2], reason: "SESSION_CONTROL" },
  { name: "pragma", input: statement("pragma", "control"), levels: [1, 1, 2, 4], reason: "SQLITE_PRAGMA" },
  ...["attach", "detach"].map(
    (op) =>
      ({
        name: op,
        input: statement(op, "control"),
        levels: [1, 2, 3, 4],
        reason: "SQLITE_ATTACH_DETACH",
      }) as MatrixRow,
  ),
  ...["call", "do", "exec", "execute"].map(
    (op) =>
      ({ name: op, input: statement(op, "indirect"), levels: [1, 2, 4, 4], reason: "INDIRECT_EXECUTION" }) as MatrixRow,
  ),
  {
    name: "indirect-read",
    input: statement("select", "read", {
      effects: ["read", "indirect", "unknown-effects"],
      aggregateEffects: ["read", "indirect", "unknown-effects"],
    }),
    levels: [1, 1, 3, 4],
    reason: "INDIRECT_READ",
  },
];
