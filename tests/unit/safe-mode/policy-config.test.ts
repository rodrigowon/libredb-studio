import { expect, test } from "bun:test";
import {
  DEFAULT_SAFE_MODE_POLICY_CONFIG,
  PolicyConfigError,
  resolvePolicyConfig,
  type SafeModePolicyConfig,
  type TrustedPolicyOverride,
} from "@/lib/safe-mode/config";
import { evaluatePolicy } from "@/lib/safe-mode/policy";
import { POLICY_PROFILES, POLICY_RULE_IDS, POLICY_RULES } from "@/lib/safe-mode/policy-rules";
import { classification, environments, matrix, rank, statement } from "./policy-fixtures";

test("defaults are versioned, deeply frozen and preserve the approved matrix", () => {
  const c = resolvePolicyConfig();
  expect(c).toEqual(DEFAULT_SAFE_MODE_POLICY_CONFIG);
  expect(c.policyVersion).toBe(1);
  expect(Object.isFrozen(c)).toBe(true);
  expect(Object.isFrozen(c.profiles)).toBe(true);
  for (const [i, profile] of POLICY_PROFILES.entries()) {
    expect(Object.isFrozen(c.profiles[profile])).toBe(true);
    for (const id of POLICY_RULE_IDS) expect(c.profiles[profile][id]).toBe(POLICY_RULES[id].levels[i]);
  }
});
test("partial trusted configuration and connection override tighten deterministically", () => {
  const global: TrustedPolicyOverride = {
    policyVersion: 1,
    profiles: { strict: { INSERT_OPERATION: "confirm_standard" } },
  };
  const connection: TrustedPolicyOverride = { profiles: { strict: { INSERT_OPERATION: "confirm_strong" } } };
  const before = JSON.stringify([global, connection]);
  const c = resolvePolicyConfig(global, connection);
  expect(c.profiles.strict.INSERT_OPERATION).toBe(3);
  expect(c.profiles.development.INSERT_OPERATION).toBe(1);
  expect(c).toEqual(resolvePolicyConfig(global, connection));
  expect(JSON.stringify([global, connection])).toBe(before);
  expect(
    evaluatePolicy({
      classification: classification([statement("insert", "write")]),
      effectiveEnvironment: "production",
      config: c,
    }).reasonCodes,
  ).toContain("SERVER_POLICY_OVERRIDE");
});
test("stronger lower-environment rules propagate upwards", () => {
  const config = resolvePolicyConfig({ profiles: { local: { INSERT_OPERATION: "block" } } });
  for (const p of POLICY_PROFILES) expect(config.profiles[p].INSERT_OPERATION).toBe(4);
  for (const row of matrix) {
    let last = -1;
    for (const env of environments) {
      const r = evaluatePolicy({ classification: classification([row.input]), effectiveEnvironment: env, config });
      expect(rank(r)).toBeGreaterThanOrEqual(last);
      last = rank(r);
    }
  }
});
test("object insertion order does not alter merge or decisions", () => {
  const a = resolvePolicyConfig({
    profiles: {
      strict: { INSERT_OPERATION: "block", DROP_TABLE: "block" },
      conservative: { INSERT_OPERATION: "confirm_standard" },
    },
  });
  const b = resolvePolicyConfig({
    profiles: {
      conservative: { INSERT_OPERATION: "confirm_standard" },
      strict: { DROP_TABLE: "block", INSERT_OPERATION: "block" },
    },
  });
  expect(a).toEqual(b);
});
test("uncertainty never undoes a trusted rule elevation", () => {
  const config = resolvePolicyConfig({
    profiles: { local: { INSERT_OPERATION: "block", READ_OPERATION: "confirm_strong" } },
  });
  for (const row of matrix)
    for (const env of environments) {
      const original = classification([row.input]);
      const base = evaluatePolicy({ classification: original, effectiveEnvironment: env, config });
      for (const status of ["partial", "unsupported", "unknown"] as const) {
        const changed = {
          ...original,
          status,
          aggregateEffects: [...original.aggregateEffects, "unknown-effects" as const],
        };
        expect(
          rank(evaluatePolicy({ classification: changed, effectiveEnvironment: env, config })),
        ).toBeGreaterThanOrEqual(rank(base));
      }
    }
});
for (const [name, invalid] of [
  ["null", null],
  ["array", []],
  ["string", "{}"],
  ["unknown-key", { enabled: false }],
  ["unknown-profile", { profiles: { production: {} } }],
  ["profile-null", { profiles: { strict: null } }],
  ["unknown-rule", { profiles: { strict: { ANYTHING: "allow" } } }],
  ["bad-value", { profiles: { strict: { INSERT_OPERATION: "perhaps" } } }],
  ["old-version", { policyVersion: 0 }],
  ["string-version", { policyVersion: "1" }],
  ["undefined-explicit", { policyVersion: undefined }],
  ["downgrade", { profiles: { strict: { DROP_DATABASE: "allow" } } }],
  ["read-client-environment", { effectiveEnvironment: "local" }],
  ["prototype", JSON.parse('{"profiles":{"__proto__":{}}}')],
  ["rollback-protection", { profiles: { strict: { TRANSACTION_CONTROL: "block" } } }],
])
  test(`invalid config rejected: ${name}`, () => {
    expect(() => resolvePolicyConfig(invalid)).toThrow(PolicyConfigError);
  });
test("managed connection cannot undo a stronger global setting", () => {
  expect(() =>
    resolvePolicyConfig(
      { profiles: { strict: { INSERT_OPERATION: "block" } } },
      { profiles: { strict: { INSERT_OPERATION: "warn" } } },
    ),
  ).toThrow(PolicyConfigError);
});
test("accessor config rejected without invoking getters", () => {
  const config = {
    get profiles() {
      throw new Error("must not run");
    },
  };
  expect(() => resolvePolicyConfig(config)).toThrow(PolicyConfigError);
});
test("unresolved config is not accepted by evaluator", () => {
  expect(() =>
    evaluatePolicy({
      classification: classification([statement("select", "read")]),
      effectiveEnvironment: "production",
      config: {} as SafeModePolicyConfig,
    }),
  ).toThrow(PolicyConfigError);
});
test("explicit null config is invalid, not an absent override", () => {
  expect(() =>
    evaluatePolicy({
      classification: classification([statement("select", "read")]),
      effectiveEnvironment: "production",
      config: null as unknown as SafeModePolicyConfig,
    }),
  ).toThrow(PolicyConfigError);
});
test("non-enumerable unknown keys cannot bypass validation", () => {
  const config = Object.defineProperty({}, "enabled", { value: false });
  expect(() => resolvePolicyConfig(config)).toThrow(PolicyConfigError);
});
