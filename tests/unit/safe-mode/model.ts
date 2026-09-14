/** Specification/oracle for the 6B.1 spike, NOT a production classifier or policy. */
export const DIALECTS = ["postgres", "mysql", "sqlite"] as const;
export type Dialect = (typeof DIALECTS)[number];
export type Category =
  | "read"
  | "write"
  | "schema"
  | "privilege"
  | "maintenance"
  | "transaction"
  | "control"
  | "indirect"
  | "unknown";
export type Effect = Category | "unknown-effects";
export type Status = "classified" | "partial" | "unknown" | "invalid" | "unsupported";

export interface StatementExpectation {
  category: Category;
  operation: string;
  effects: Effect[];
  /** Only the predicate owned by this modifying operation. Never a safety proof. */
  hasWhere?: boolean;
  scopeIsSafe: "not-proven";
  children?: StatementExpectation[];
  explainMode?: "estimate" | "analyze";
  executesChildren?: boolean;
}

export interface ClassificationExpectation {
  status: Status;
  /** Ordered top-level statements; children retain internal effects. */
  statements: StatementExpectation[];
  aggregateEffects: Effect[];
  limitations: string[];
}

export interface SqlCase {
  id: string;
  dialect: Dialect | "unsupported-engine";
  sql: string;
  purpose: string;
  /** Syntax oracle, independent of what either candidate parser accepts. */
  syntax: "valid" | "invalid" | "unknown";
  expected: ClassificationExpectation;
  source?: "create-table" | "schema-diff";
  context?: { originalSql: string; intent: "estimate" | "analyze"; effectiveSql: string };
}

export function statement(
  category: Category,
  operation: string,
  extra: Partial<StatementExpectation> = {},
): StatementExpectation {
  return { category, operation, effects: [category], scopeIsSafe: "not-proven", ...extra };
}

export function aggregate(statements: StatementExpectation[]): Effect[] {
  const effects = statements.flatMap((item) => [
    ...item.effects,
    ...(item.executesChildren === false ? [] : aggregate(item.children ?? [])),
  ]);
  return [...new Set(effects)].sort();
}

export function expectation(
  statements: StatementExpectation[],
  status: Status = "classified",
  limitations: string[] = [],
): ClassificationExpectation {
  return { status, statements, aggregateEffects: aggregate(statements), limitations };
}
