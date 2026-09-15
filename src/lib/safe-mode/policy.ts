import { assertResolvedPolicyConfig, DEFAULT_SAFE_MODE_POLICY_CONFIG } from "./config";
import { POLICY_PROFILES, POLICY_RULES, SAFE_MODE_POLICY_VERSION, type PolicyRuleId } from "./policy-rules";
import type {
  EvaluatePolicyInput,
  EffectiveEnvironment,
  PolicyDecision,
  PolicyOutcome,
  PolicyProfile,
  PolicyRisk,
  Protection,
  StatementPolicyDecision,
} from "./policy-types";
import type { ClassifiedStatement, ClassificationStatus, SqlCategory, SqlEffect } from "./types";

const risks: readonly PolicyRisk[] = ["low", "medium", "high", "critical"];
interface Accumulator {
  level: Protection;
  risk: PolicyRisk;
  reasons: Set<string>;
  limitations: Set<string>;
}
const fresh = (): Accumulator => ({ level: 0, risk: "low", reasons: new Set(), limitations: new Set() });
function merge(target: Accumulator, source: Accumulator): void {
  target.level = Math.max(target.level, source.level) as Protection;
  target.risk = risks[Math.max(risks.indexOf(target.risk), risks.indexOf(source.risk))];
  for (const reason of source.reasons) target.reasons.add(reason);
  for (const limitation of source.limitations) target.limitations.add(limitation);
}
function outcome(a: Accumulator): PolicyOutcome {
  return {
    decision: a.level === 4 ? "block" : a.level >= 2 ? "require_confirmation" : a.level === 1 ? "warn" : "allow",
    risk: a.risk,
    reasonCodes: [...a.reasons].sort(),
    ...(a.level === 2 || a.level === 3
      ? { confirmationLevel: a.level === 3 ? ("strong" as const) : ("standard" as const) }
      : {}),
    analysisLimitations: [...a.limitations].sort(),
  };
}
function environment(value: EffectiveEnvironment): { effective: EffectiveEnvironment; profile: PolicyProfile } {
  switch (value) {
    case "local":
      return { effective: value, profile: "local" };
    case "development":
      return { effective: value, profile: "development" };
    case "staging":
      return { effective: value, profile: "conservative" };
    case "production":
      return { effective: value, profile: "strict" };
    default:
      return { effective: "other", profile: "conservative" };
  }
}

/** Structured classification only. Never reads SQL/parameters, never reclassifies,
 * never resolves a connection/environment and never executes its recommendation.
 */
export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecision {
  const config = input.config === undefined ? DEFAULT_SAFE_MODE_POLICY_CONFIG : input.config;
  assertResolvedPolicyConfig(config);
  const env = environment(input.effectiveEnvironment);
  const profileIndex = POLICY_PROFILES.indexOf(env.profile);
  const apply = (a: Accumulator, id: PolicyRuleId) => {
    const definition = POLICY_RULES[id];
    const level = config.profiles[env.profile][id];
    a.level = Math.max(a.level, level) as Protection;
    a.risk = risks[Math.max(risks.indexOf(a.risk), risks.indexOf(definition.risk))];
    a.reasons.add(id);
    if (level > definition.levels[profileIndex]) a.reasons.add("SERVER_POLICY_OVERRIDE");
  };
  const uncertainty = (a: Accumulator, status: ClassificationStatus, limitations: readonly string[]) => {
    if (status === "partial") apply(a, "PARTIAL_CLASSIFICATION");
    else if (status === "unsupported") apply(a, "UNSUPPORTED_CLASSIFICATION");
    else if (status === "invalid") apply(a, "INVALID_CLASSIFICATION");
    else if (status !== "classified") apply(a, "UNKNOWN_CLASSIFICATION");
    for (const limitation of limitations) {
      a.limitations.add(limitation);
      if (limitation.startsWith("limit-exceeded:")) apply(a, "LIMIT_EXCEEDED");
    }
  };
  const effect = (a: Accumulator, value: SqlEffect, readContext: boolean) => {
    switch (value) {
      case "read":
        apply(a, "READ_OPERATION");
        break;
      case "write":
        apply(a, "UNRECOGNIZED_WRITE");
        a.reasons.add("WRITE_OPERATION");
        break;
      case "schema":
        apply(a, "UNRECOGNIZED_SCHEMA_CHANGE");
        a.reasons.add("SCHEMA_CHANGE");
        break;
      case "privilege":
        apply(a, "PRIVILEGE_CHANGE");
        break;
      case "maintenance":
        apply(a, "UNRECOGNIZED_MAINTENANCE");
        break;
      case "transaction":
        apply(a, "TRANSACTION_CONTROL");
        break;
      case "control":
        apply(a, "SESSION_CONTROL");
        break;
      case "indirect":
        apply(a, readContext ? "INDIRECT_READ" : "INDIRECT_EXECUTION");
        break;
      case "unknown-effects":
        apply(a, "UNKNOWN_EFFECTS");
        break;
      default:
        apply(a, "UNKNOWN_CLASSIFICATION");
        break;
    }
  };
  const visit = (
    s: ClassifiedStatement,
    execution: StatementPolicyDecision["execution"],
  ): { state: Accumulator; result: StatementPolicyDecision } => {
    const a = fresh();
    const covered = new Set<SqlCategory>();
    const operation = (rule: PolicyRuleId, category: SqlCategory) => {
      apply(a, rule);
      covered.add(category);
    };
    switch (s.operation) {
      case "select":
        operation("READ_OPERATION", "read");
        break;
      case "insert":
        operation("INSERT_OPERATION", "write");
        break;
      case "update":
        operation(
          s.hasWhere === true
            ? "UPDATE_WITH_WHERE"
            : s.hasWhere === false
              ? "UPDATE_WITHOUT_WHERE"
              : "UPDATE_WHERE_UNKNOWN",
          "write",
        );
        break;
      case "delete":
        operation(
          s.hasWhere === true
            ? "DELETE_WITH_WHERE"
            : s.hasWhere === false
              ? "DELETE_WITHOUT_WHERE"
              : "DELETE_WHERE_UNKNOWN",
          "write",
        );
        break;
      case "create-table":
      case "create-index":
      case "create-view":
        operation("CREATE_SCHEMA_OBJECT", "schema");
        break;
      case "alter-table":
        operation("ALTER_TABLE", "schema");
        break;
      case "drop-table":
        operation("DROP_TABLE", "schema");
        break;
      case "drop-database":
        operation("DROP_DATABASE", "schema");
        break;
      case "drop-index":
      case "drop-view":
        operation("DROP_INDEX_OR_VIEW", "schema");
        break;
      case "truncate":
      case "truncate-table":
        operation("TRUNCATE", "schema");
        break;
      case "grant":
      case "revoke":
        operation("PRIVILEGE_CHANGE", "privilege");
        break;
      case "analyze":
        operation("ANALYZE", "maintenance");
        break;
      case "vacuum":
        operation("VACUUM", "maintenance");
        break;
      case "vacuum-full":
        operation("VACUUM_FULL", "maintenance");
        break;
      case "reindex":
        operation("REINDEX", "maintenance");
        break;
      case "begin":
      case "commit":
      case "rollback":
      case "savepoint":
      case "release":
        operation("TRANSACTION_CONTROL", "transaction");
        break;
      case "pragma":
        operation("SQLITE_PRAGMA", "control");
        break;
      case "attach":
      case "detach":
        operation("SQLITE_ATTACH_DETACH", "control");
        break;
      case "set":
      case "reset":
      case "use":
        operation("SESSION_CONTROL", "control");
        break;
      case "call":
      case "do":
      case "exec":
      case "execute":
        operation("INDIRECT_EXECUTION", "indirect");
        break;
      case "explain":
        operation("READ_OPERATION", "read");
        if (s.explainMode === "analyze") apply(a, "EXPLAIN_ANALYZE");
        else if (s.explainMode !== "estimate" || s.executesChildren !== false) apply(a, "UNKNOWN_CLASSIFICATION");
        if (!s.children.length) apply(a, "UNKNOWN_CLASSIFICATION");
        break;
      default:
        effect(a, s.category, s.category === "read");
        covered.add(s.category);
        // A novel operation cannot borrow an existing category to gain certainty.
        apply(a, "UNKNOWN_CLASSIFICATION");
    }
    if (covered.has("write")) a.reasons.add("WRITE_OPERATION");
    if (covered.has("schema")) a.reasons.add("SCHEMA_CHANGE");
    const ownEffects = new Set<SqlEffect>([s.category, ...s.effects]);
    for (const value of ownEffects) if (!covered.has(value as SqlCategory)) effect(a, value, s.category === "read");
    uncertainty(a, s.status, s.limitations);

    // Only known non-executing definitions may suppress children. Never honor a
    // false flag on an ordinary SELECT/CTE, nor on EXPLAIN ANALYZE.
    const noExecution =
      s.executesChildren === false &&
      (s.operation === "create-view" || (s.operation === "explain" && s.explainMode === "estimate"));
    const childExecution = noExecution ? "not-executed" : s.executesChildren === "unknown" ? "unknown" : "executed";
    const children: StatementPolicyDecision[] = [];
    const accounted = new Set<SqlEffect>(ownEffects);
    for (const child of s.children) {
      const childDecision = visit(child, childExecution);
      children.push(childDecision.result);
      if (!noExecution) {
        merge(a, childDecision.state);
        for (const value of child.aggregateEffects) accounted.add(value);
      } else {
        // Even when not run, an unrecognized child cannot certify the enclosing plan.
        uncertainty(a, child.status, child.limitations);
        if (child.aggregateEffects.includes("unknown-effects")) apply(a, "UNKNOWN_EFFECTS");
        if (child.aggregateEffects.includes("indirect")) apply(a, "INDIRECT_READ");
      }
    }
    if (s.executesChildren === "unknown") apply(a, "UNKNOWN_EFFECTS");
    if (s.operation === "explain" && s.explainMode === "analyze" && s.executesChildren !== true)
      apply(a, "UNKNOWN_CLASSIFICATION");
    for (const value of s.aggregateEffects) if (!accounted.has(value)) effect(a, value, s.category === "read");
    return { state: a, result: { ...outcome(a), operation: s.operation, execution, children } };
  };

  const aggregate = fresh();
  const statementDecisions: StatementPolicyDecision[] = [];
  const accounted = new Set<SqlEffect>();
  for (const s of input.classification.statements) {
    const evaluated = visit(s, "executed");
    statementDecisions.push(evaluated.result);
    merge(aggregate, evaluated.state);
    for (const value of s.aggregateEffects) accounted.add(value);
  }
  uncertainty(aggregate, input.classification.status, input.classification.limitations);
  if (!statementDecisions.length) apply(aggregate, "UNKNOWN_CLASSIFICATION");
  if (input.classification.certainty !== "recognized-subset") apply(aggregate, "PARTIAL_CLASSIFICATION");
  for (const value of input.classification.aggregateEffects)
    if (!accounted.has(value)) effect(aggregate, value, input.classification.aggregateEffects.includes("read"));
  if (statementDecisions.length > 1) aggregate.reasons.add("MULTI_STATEMENT");
  if (env.effective === "production") aggregate.reasons.add("PRODUCTION_ENVIRONMENT");
  if (env.effective === "other") aggregate.reasons.add("OTHER_ENVIRONMENT_CONSERVATIVE");
  const result = outcome(aggregate);
  return {
    ...result,
    policyVersion: SAFE_MODE_POLICY_VERSION,
    effectiveEnvironment: env.effective,
    profile: env.profile,
    aggregateDecision: result.decision,
    statementDecisions,
  };
}
