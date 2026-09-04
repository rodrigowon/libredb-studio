"use client";

import { useFormatter, useTranslations } from "next-intl";
import { AGENT_EXECUTION_ENGINES } from "@/lib/agent/engine-support";
import { getDBConfig } from "@/lib/db-ui-config";
import { EXTERNAL_DATABASE_TYPES } from "@/lib/db/compatibility";
import { filterEnabledDatabaseTypes } from "@/lib/database-visibility";
import { LIVE_CHANNELS, LIVE_PLATFORMS } from "@/lib/distribution/channels.generated";
import { DEPLOY_GROUP_ORDER } from "@/lib/distribution/deploy-groups";

/**
 * The two agent modes, in the order a user meets them.
 *
 * The descriptions are pinned to `docs/AGENT.md` and the split is load-bearing: plan mode
 * executes nothing on any engine, agent mode executes read-only and only where the provider
 * implements `queryReadOnly`. The engine names in the second line come from
 * `AGENT_EXECUTION_ENGINES`, so an engine that gains that method updates this claim without
 * a copy edit - and the count below is this array's length, never a typed "2".
 *
 * Engine names are joined by next-intl's locale-aware formatter instead of English-only
 * punctuation.
 *
 * `tests/components/LoginPage.test.tsx` pins the claim rather than the wording: dropping a
 * mode, or naming an engine agent mode cannot execute on, fails CI.
 */
export interface HeroClaim {
  key: "engines" | "channels" | "agent";
  value: number;
  unit: string;
  detail: string;
}

/**
 * Three claims, three derived numbers, nothing else.
 *
 * This replaces the four feature cards that used to sit here. The cards said the same
 * things at four different lengths, which is what made the panel ragged: the agent card ran
 * to four lines while the engine card ran to two, so the 2x2 grid never had a baseline.
 * A number, a noun and one qualifying line give each claim the same shape, and the reader
 * can compare them at a glance instead of reading four paragraphs.
 *
 * Every count is a `.length` on a derived array. That is the whole point of issue #425:
 * "7+" was written when the answer was 7, and it stayed while the answer became 11.
 */
/**
 * The three claims are derived for the active locale and shared by both login surfaces so
 * they cannot drift: the desktop hero renders them as a figure and the mobile block joins
 * the same strings into one line.
 */
export function useHeroClaims(): readonly HeroClaim[] {
  const t = useTranslations("Login.hero.proof");
  const format = useFormatter();
  const agentEngines = filterEnabledDatabaseTypes(AGENT_EXECUTION_ENGINES).map((type) => getDBConfig(type).label);
  const agentModes = [
    { label: t("planLabel"), detail: t("planDetail") },
    { label: t("agentLabel"), detail: t("agentDetail", { engines: format.list(agentEngines) }) },
  ];

  return [
    {
      key: "engines",
      value: filterEnabledDatabaseTypes(EXTERNAL_DATABASE_TYPES).length,
      unit: t("enginesUnit"),
      detail: t("enginesDetail"),
    },
    {
      key: "channels",
      value: LIVE_CHANNELS.length,
      unit: t("channelsUnit"),
      detail: format.list(DEPLOY_GROUP_ORDER.map((group) => t(`deployGroups.${group}`))),
    },
    {
      key: "agent",
      value: agentModes.length,
      unit: t("agentUnit"),
      detail: agentModes.map((mode) => `${mode.label} ${mode.detail}`).join(". "),
    },
  ];
}

/**
 * The workstation and server operating systems, taken from `LIVE_PLATFORMS`.
 *
 * Filtered rather than rendered whole, and the filter is the point: `container`,
 * `kubernetes` and `cloud` are already the first three channel groups above, so printing
 * them again here would say Containers and Kubernetes twice in adjacent lines. What is left
 * is the question this line answers and the claim above cannot - whether the machine in
 * front of you can run it.
 */
const OS_PLATFORM_LABELS: Record<string, string> = { linux: "Linux", macos: "macOS", windows: "Windows" };
const OS_PLATFORMS = LIVE_PLATFORMS.filter((platform) => platform in OS_PLATFORM_LABELS);

export function HeroProof({ claims }: { claims: readonly HeroClaim[] }) {
  const t = useTranslations("Login.hero.proof");
  const format = useFormatter();

  return (
    <div className="space-y-3">
      <dl data-testid="hero-proof" className="grid grid-cols-3 gap-x-6 gap-y-2 select-none">
        {claims.map((claim) => (
          <div key={claim.key} className="space-y-1">
            <dt className="flex items-baseline gap-1.5">
              <span className="text-2xl xl:text-3xl font-semibold text-white tabular-nums tracking-tight">
                {claim.value}
              </span>
              <span className="text-xs text-fg-tertiary">{claim.unit}</span>
            </dt>
            <dd
              className="text-xs text-fg-tertiary leading-relaxed"
              data-testid={claim.key === "agent" ? "agent-claim" : undefined}
            >
              {claim.detail}
            </dd>
          </div>
        ))}
      </dl>

      <p data-testid="platform-line" className="text-xs text-fg-tertiary select-none">
        {t("runsOn", { platforms: format.list(OS_PLATFORMS.map((platform) => OS_PLATFORM_LABELS[platform])) })}
      </p>
    </div>
  );
}
