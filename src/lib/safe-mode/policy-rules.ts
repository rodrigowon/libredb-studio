import type { PolicyRisk, Protection } from "./policy-types";

export const SAFE_MODE_POLICY_VERSION = 1 as const;
type Rule = Readonly<{ risk: PolicyRisk; levels: readonly [Protection, Protection, Protection, Protection] }>;
const rule = (risk: PolicyRisk, ...levels: [Protection, Protection, Protection, Protection]): Rule =>
  Object.freeze({ risk, levels: Object.freeze(levels) });

/** local, development, conservative (staging/other), strict (production).
 * 0 allow < 1 warn < 2 standard confirmation < 3 strong confirmation < 4 block.
 * Keys are versioned machine reason codes, not UI text.
 */
export const POLICY_RULES = Object.freeze({
  READ_OPERATION: rule("low", 0, 0, 0, 0),
  INSERT_OPERATION: rule("medium", 0, 1, 1, 1),
  UPDATE_WITH_WHERE: rule("high", 0, 1, 2, 2),
  UPDATE_WITHOUT_WHERE: rule("critical", 1, 2, 4, 4),
  UPDATE_WHERE_UNKNOWN: rule("critical", 1, 2, 4, 4),
  DELETE_WITH_WHERE: rule("high", 0, 1, 2, 2),
  DELETE_WITHOUT_WHERE: rule("critical", 1, 2, 4, 4),
  DELETE_WHERE_UNKNOWN: rule("critical", 1, 2, 4, 4),
  CREATE_SCHEMA_OBJECT: rule("medium", 0, 1, 1, 2),
  ALTER_TABLE: rule("high", 1, 1, 2, 3),
  DROP_TABLE: rule("critical", 1, 2, 3, 3),
  DROP_DATABASE: rule("critical", 3, 4, 4, 4),
  DROP_INDEX_OR_VIEW: rule("high", 1, 1, 2, 2),
  TRUNCATE: rule("critical", 1, 2, 3, 3),
  PRIVILEGE_CHANGE: rule("high", 1, 2, 3, 3),
  ANALYZE: rule("medium", 0, 0, 1, 1),
  VACUUM: rule("medium", 0, 1, 1, 2),
  VACUUM_FULL: rule("high", 1, 2, 3, 3),
  REINDEX: rule("high", 1, 2, 2, 3),
  TRANSACTION_CONTROL: rule("low", 0, 0, 0, 0),
  SESSION_CONTROL: rule("high", 1, 1, 1, 2),
  SQLITE_PRAGMA: rule("high", 1, 1, 2, 4),
  SQLITE_ATTACH_DETACH: rule("high", 1, 2, 3, 4),
  INDIRECT_EXECUTION: rule("critical", 1, 2, 4, 4),
  INDIRECT_READ: rule("high", 1, 1, 3, 4),
  UNKNOWN_CLASSIFICATION: rule("high", 1, 2, 4, 4),
  PARTIAL_CLASSIFICATION: rule("high", 1, 1, 3, 4),
  INVALID_CLASSIFICATION: rule("high", 1, 2, 4, 4),
  UNSUPPORTED_CLASSIFICATION: rule("high", 1, 2, 4, 4),
  LIMIT_EXCEEDED: rule("high", 1, 2, 4, 4),
  UNKNOWN_EFFECTS: rule("high", 1, 1, 3, 4),
  EXPLAIN_ANALYZE: rule("medium", 1, 1, 2, 2),
  UNRECOGNIZED_WRITE: rule("high", 1, 2, 3, 4),
  UNRECOGNIZED_SCHEMA_CHANGE: rule("high", 1, 2, 3, 4),
  UNRECOGNIZED_MAINTENANCE: rule("high", 1, 2, 3, 4),
});
export type PolicyRuleId = keyof typeof POLICY_RULES;
export const POLICY_RULE_IDS = Object.freeze(Object.keys(POLICY_RULES).sort() as PolicyRuleId[]);
export const POLICY_PROFILES = ["local", "development", "conservative", "strict"] as const;
