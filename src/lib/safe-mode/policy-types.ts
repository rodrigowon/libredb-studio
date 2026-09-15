import type { SafeModePolicyConfig } from "./config";
import type { SqlClassification } from "./types";

export type PolicyAction = "allow" | "warn" | "require_confirmation" | "block";
export type PolicyRisk = "low" | "medium" | "high" | "critical";
export type ConfirmationLevel = "standard" | "strong";
export type EffectiveEnvironment = "local" | "development" | "staging" | "production" | "other";
export type PolicyProfile = "local" | "development" | "conservative" | "strict";
export type Protection = 0 | 1 | 2 | 3 | 4;
export type ConfiguredProtection = "allow" | "warn" | "confirm_standard" | "confirm_strong" | "block";

export interface EvaluatePolicyInput {
  classification: SqlClassification;
  /** Must eventually come from trusted server resolution, NOT browser connection metadata. */
  effectiveEnvironment: EffectiveEnvironment;
  /** Only a config returned by resolvePolicyConfig, never a browser payload. */
  config?: SafeModePolicyConfig;
}

export interface PolicyOutcome {
  decision: PolicyAction;
  risk: PolicyRisk;
  reasonCodes: string[];
  confirmationLevel?: ConfirmationLevel;
  analysisLimitations: string[];
}

export interface StatementPolicyDecision extends PolicyOutcome {
  operation: string;
  /** Relative to its parent. Not-executed children are retained for inspection only. */
  execution: "executed" | "not-executed" | "unknown";
  children: StatementPolicyDecision[];
}

export interface PolicyDecision extends PolicyOutcome {
  policyVersion: number;
  effectiveEnvironment: EffectiveEnvironment;
  profile: PolicyProfile;
  aggregateDecision: PolicyAction;
  statementDecisions: StatementPolicyDecision[];
}
