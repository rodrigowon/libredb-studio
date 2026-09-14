/** Syntactic observations only. No execution decision or database-context proof. */
export type SqlDialect = "postgres" | "mysql" | "sqlite";
export type ClassificationStatus = "classified" | "partial" | "unknown" | "invalid" | "unsupported";
export type SqlCategory =
  | "read"
  | "write"
  | "schema"
  | "privilege"
  | "maintenance"
  | "transaction"
  | "control"
  | "indirect"
  | "unknown";
export type SqlEffect = SqlCategory | "unknown-effects";

export interface SqlClassificationInput {
  dialect: string;
  /** Exact text being classified. Never formatted, interpolated or rewritten. */
  sql: string;
  /** Optional provenance only; NOT a second input analyzed by this call. */
  originalSql?: string;
  /** Opaque binding to the classified text; future confirmation must bind both. */
  parameters?: readonly unknown[] | Readonly<Record<string, unknown>>;
}

export interface SqlEvidence {
  kind: "operation" | "possible-effect" | "function-invocation";
  operation: string;
  effect: SqlEffect;
  /** UTF-16 offsets into effectiveSql, including for CTE children. */
  start: number;
  end: number;
}

export interface ClassifiedStatement {
  status: ClassificationStatus;
  category: SqlCategory;
  operation: string;
  start: number;
  end: number;
  sql: string;
  effects: SqlEffect[];
  aggregateEffects: SqlEffect[];
  evidence: SqlEvidence[];
  children: ClassifiedStatement[];
  limitations: string[];
  scopeIsSafe: "not-proven";
  hasWhere?: boolean | "unknown";
  explainMode?: "estimate" | "analyze" | "unknown";
  executesChildren?: boolean | "unknown";
}

export interface SqlClassification {
  status: ClassificationStatus;
  dialect: string;
  originalSql: string;
  effectiveSql: string;
  parameters?: SqlClassificationInput["parameters"];
  statements: ClassifiedStatement[];
  aggregateEffects: SqlEffect[];
  limitations: string[];
  /** Certainty refers to the recognized syntactic subset, never engine semantics. */
  certainty: "recognized-subset" | "incomplete";
  scopeIsSafe: "not-proven";
}
