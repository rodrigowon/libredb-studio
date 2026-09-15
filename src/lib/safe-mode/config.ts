import {
  POLICY_PROFILES,
  POLICY_RULE_IDS,
  POLICY_RULES,
  SAFE_MODE_POLICY_VERSION,
  type PolicyRuleId,
} from "./policy-rules";
import type { ConfiguredProtection, PolicyProfile, Protection } from "./policy-types";

const resolvedConfig = Symbol("resolved-safe-mode-policy-config");
export interface SafeModePolicyConfig {
  readonly [resolvedConfig]: true;
  readonly policyVersion: typeof SAFE_MODE_POLICY_VERSION;
  readonly profiles: Readonly<Record<PolicyProfile, Readonly<Record<PolicyRuleId, Protection>>>>;
}

/** This is a server-managed configuration model, not proof of provenance.
 * No client toggle, environment reassignment, role bypass, SQL or env loader.
 */
export interface TrustedPolicyOverride {
  policyVersion?: typeof SAFE_MODE_POLICY_VERSION;
  profiles?: Partial<Record<PolicyProfile, Partial<Record<PolicyRuleId, ConfiguredProtection>>>>;
}
const levels: Record<ConfiguredProtection, Protection> = {
  allow: 0,
  warn: 1,
  confirm_standard: 2,
  confirm_strong: 3,
  block: 4,
};
export class PolicyConfigError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONFIG"
      | "UNKNOWN_CONFIG_KEY"
      | "POLICY_VERSION_MISMATCH"
      | "PROTECTION_DOWNGRADE"
      | "RECOVERY_RULE_OVERRIDE",
    readonly path: string,
  ) {
    super(`${code}:${path}`);
  }
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new PolicyConfigError("INVALID_CONFIG", path);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
      throw new PolicyConfigError("INVALID_CONFIG", path);
  }
  return value as Record<string, unknown>;
}

/** Defaults + global + managed-connection overrides. Strict validation, tightening only.
 * Each layer takes max; stronger lower-environment settings propagate upwards.
 * Throws on invalid config; callers must not retry with a weaker environment/config.
 */
export function resolvePolicyConfig(
  globalOverride?: unknown,
  managedConnectionOverride?: unknown,
): SafeModePolicyConfig {
  const profiles = Object.fromEntries(
    POLICY_PROFILES.map((profile, index) => [
      profile,
      Object.fromEntries(POLICY_RULE_IDS.map((id) => [id, POLICY_RULES[id].levels[index]])),
    ]),
  ) as Record<PolicyProfile, Record<PolicyRuleId, Protection>>;
  for (const [layer, raw] of [
    ["global", globalOverride],
    ["managedConnection", managedConnectionOverride],
  ] as const) {
    if (raw === undefined) continue;
    const config = record(raw, layer);
    for (const key of Object.keys(config).sort()) {
      if (key !== "profiles" && key !== "policyVersion")
        throw new PolicyConfigError("UNKNOWN_CONFIG_KEY", `${layer}.${key}`);
    }
    if (Object.hasOwn(config, "policyVersion") && config.policyVersion !== SAFE_MODE_POLICY_VERSION)
      throw new PolicyConfigError("POLICY_VERSION_MISMATCH", `${layer}.policyVersion`);
    if (!Object.hasOwn(config, "profiles")) continue;
    const overrides = record(config.profiles, `${layer}.profiles`);
    for (const key of Object.keys(overrides).sort()) {
      if (!(POLICY_PROFILES as readonly string[]).includes(key))
        throw new PolicyConfigError("UNKNOWN_CONFIG_KEY", `${layer}.profiles.${key}`);
      const profile = key as PolicyProfile;
      const rules = record(overrides[key], `${layer}.profiles.${key}`);
      for (const id of Object.keys(rules).sort()) {
        const path = `${layer}.profiles.${key}.${id}`;
        if (!Object.hasOwn(POLICY_RULES, id)) throw new PolicyConfigError("UNKNOWN_CONFIG_KEY", path);
        const value = rules[id];
        if (typeof value !== "string" || !Object.hasOwn(levels, value))
          throw new PolicyConfigError("INVALID_CONFIG", path);
        const level = levels[value as ConfiguredProtection];
        if (id === "TRANSACTION_CONTROL" && level !== 0) throw new PolicyConfigError("RECOVERY_RULE_OVERRIDE", path);
        if (level < profiles[profile][id as PolicyRuleId]) throw new PolicyConfigError("PROTECTION_DOWNGRADE", path);
        profiles[profile][id as PolicyRuleId] = level;
      }
    }
    for (const id of POLICY_RULE_IDS)
      for (let i = 1; i < POLICY_PROFILES.length; i++) {
        const profile = POLICY_PROFILES[i];
        profiles[profile][id] = Math.max(profiles[profile][id], profiles[POLICY_PROFILES[i - 1]][id]) as Protection;
      }
  }
  for (const profile of POLICY_PROFILES) Object.freeze(profiles[profile]);
  return Object.freeze({
    [resolvedConfig]: true as const,
    policyVersion: SAFE_MODE_POLICY_VERSION,
    profiles: Object.freeze(profiles),
  });
}

export const DEFAULT_SAFE_MODE_POLICY_CONFIG = resolvePolicyConfig();

export function assertResolvedPolicyConfig(config: SafeModePolicyConfig): void {
  if (
    !config ||
    config[resolvedConfig] !== true ||
    config.policyVersion !== SAFE_MODE_POLICY_VERSION ||
    !Object.isFrozen(config)
  ) {
    throw new PolicyConfigError("INVALID_CONFIG", "resolvedConfig");
  }
}
