/**
 * What the SELECTED MODE does to the database, on one axis: what does it execute?
 *
 * The rail used to answer that question in six places at once - a mode description, a
 * consent paragraph, a budget note, a guard line, a refusal and a claim under the answer -
 * and a user comparing two of them could not tell which one bounded the run. This module is
 * the single reading, in four levels, and it is the ONLY thing the safety strip renders.
 *
 * It states nothing new. Every claim here is a claim some other module enforces:
 * `AGENT_EXECUTION_ENGINES` mirrors the factory's profile gate, the figures come from the
 * workflow policy rows and from `AGENT_HANDOVER_BUDGET`, and the hand-over paragraph IS the
 * sentence the consent step shows - `autoExecuteTerms` below is that one source, exported so
 * the strip and the consent card cannot drift into two versions of a sentence a user agrees
 * to.
 *
 * Three properties are load-bearing and easy to lose:
 *
 *  - **Client-safe imports only** - types, `AGENT_EXECUTION_ENGINES`, `getDBConfig` and the
 *    policy constants. A provider module here would drag `oracledb`/`mssql` toward a bundle
 *    that must not have them, which is the rule `engine-support.ts` records in its header.
 *  - **Every engine name and every number is DERIVED.** Not one is typed as a literal, and
 *    not one is a count. The point of #425 is that "7+" was written when the answer was 7
 *    and stayed while the answer became 11; the same trap is one edit away here, because
 *    each of these sentences names a set the server decides.
 *  - **The qualifier is visible, never folded into the popover.** A bare "executes nothing"
 *    overclaims: on the dialects `CATALOG_PLANS` serves, plan mode's grounding capture IS a
 *    catalog read, and `engine-support.ts` says in its own header that copy compressing these
 *    facts overclaims. The strip therefore shows both halves on one line, and the popover
 *    carries the full claim rather than the missing half.
 */

import { englishAgentTranslator, type AgentTranslator } from "@/i18n/agent";
import { AGENT_EXECUTION_ENGINES } from "@/lib/agent/engine-support";
import { AGENT_HANDOVER_BUDGET, AGENT_WORKFLOW_BUDGETS } from "@/lib/agent/execution-policy";
import type { AgentRunMode, AgentRunWorkflowType } from "@/lib/agent/types";
import { getDBConfig } from "@/lib/db-ui-config";
import type { DatabaseType } from "@/lib/types";

/**
 * The four levels, named by what they say about execution rather than by a colour: a tone
 * is chosen by this module and a palette is chosen by the strip, so a restyle cannot change
 * a claim.
 */
export type AgentPostureTone = "safe" | "reads" | "widened" | "blocked";

export interface AgentPosture {
  readonly tone: AgentPostureTone;
  /** The pill. Short enough to read at a glance, and true on its own. */
  readonly headline: string;
  /** Beside the pill, always visible: the half a compressed headline would drop. */
  readonly qualifier: string;
  /** The popover's heading. */
  readonly title: string;
  /** The popover's text, and the whole claim. */
  readonly body: string;
}

/**
 * The dialects whose grounding capture is a COMPOSED CATALOG READ rather than a request that
 * the provider describe its own schema - `CATALOG_PLANS` in `src/lib/agent/context-snapshot.ts`.
 *
 * Mirrored rather than imported, and for the reason this module exists at all: that module
 * reaches `node:crypto` and the tool layer, so importing it would put the agent's server tree
 * behind a browser bundle. `tests/unit/lib/agent/posture.test.ts` reads the real
 * `CATALOG_PLANS` out of its source and fails if this mirror falls behind it, which is what
 * keeps a mirror from becoming a second opinion.
 */
const CATALOG_CAPTURE_ENGINES: readonly DatabaseType[] = ["postgres", "sqlite"];

/**
 * The per-statement bounds agent mode runs under, taken from one policy row.
 *
 * One row and not a fold, because the posture is read with no workflow in hand: the strip is
 * shown before a run is opened and beside a run whose workflow the user did not choose.
 * `workflowBudget()` writes `statementTimeoutMs` and `maxResultRows` once for every row and
 * varies only the per-run ceilings, so one row's figures are every row's figures - and the
 * test asserts exactly that, so a row that ever varied them fails CI rather than quietly
 * making this sentence wrong for one workflow. The fix then is to give the posture a
 * workflow, never to edit a digit.
 */
const STATEMENT_BOUNDS = AGENT_WORKFLOW_BUDGETS.investigation.policy.budgets;

/**
 * The engines agent mode can execute on, named as the product names them.
 *
 * Keep the original English list punctuation; only the conjunction is localized.
 * Provider names are derived and passed as values, never translated.
 */
const engineNames = (types: readonly DatabaseType[], t: AgentTranslator): string => {
  const names = types.map((type) => getDBConfig(type).label);
  if (names.length < 2) return names.join("");
  return t("engineList", { initial: names.slice(0, -1).join(", "), last: names[names.length - 1] });
};

/**
 * The terms of the auto-execute consent, as ONE sentence-run rather than as JSX prose: the
 * figures are interpolated and a formatter is free to reflow JSX text around them, which is
 * how "500-row limit" becomes "500 -row limit" without anyone touching the copy. This is the
 * sentence a user consents to, so it is written and rendered as written.
 *
 * It takes the workflow rather than reading a selection, because there is no longer a
 * selection to read at the moment it is shown: the consent step is reached with a workflow
 * already decided — by the classifier or by the user under Advanced — and the bounds it names
 * are that workflow's own.
 *
 * It lives here, beside the posture that quotes it, so the strip's widened body and the
 * checkbox's accessible description are one string with one author.
 */
export function autoExecuteTerms(
  workflowType: AgentRunWorkflowType,
  t: AgentTranslator = englishAgentTranslator,
): string {
  return handoverTerms(AGENT_WORKFLOW_BUDGETS[workflowType].policy.budgets, t);
}

/** The consent sentence itself, over whichever row named it. */
function handoverTerms(
  budgets: { readonly maxResultRows: number; readonly statementTimeoutMs: number },
  t: AgentTranslator,
): string {
  return t("handoverTerms", {
    rows: budgets.maxResultRows,
    seconds: budgets.statementTimeoutMs / 1000,
    editorRows: AGENT_HANDOVER_BUDGET.maxResultRows,
  });
}

/** Plan mode, on every engine, with or without the hand-over ticked. */
function planPosture(t: AgentTranslator): AgentPosture {
  return {
    tone: "safe",
    headline: t("posturePlanHeadline"),
    qualifier: t("posturePlanQualifier"),
    title: t("posturePlanTitle"),
    body: t("posturePlanBody", { engines: engineNames(CATALOG_CAPTURE_ENGINES, t) }),
  };
}

/**
 * Agent mode on an engine whose provider implements no read-only statement path.
 *
 * Two facts travel with the refusal because leaving either out reads as a dead end: plan
 * mode drafts here, and the `operations` workflow runs here too - it composes no statement
 * at all, so its acquisition never asks the engine for a read-only one.
 *
 * The body says the refusal happens AT START, which is what `POST /api/agent/runs` now
 * does: a run whose workflow sends a statement is refused from the connection's own type
 * before a run id exists (#512). It used to say the run ends
 * `engine-unsupported` before its first statement, which was true while the refusal was
 * the provider factory's alone - and would now describe a run this build does not open.
 */
function unsupportedPosture(engineLabel: string, t: AgentTranslator): AgentPosture {
  return {
    tone: "blocked",
    headline: t("postureUnsupportedHeadline", { engine: engineLabel }),
    qualifier: t("postureUnsupportedQualifier"),
    title: t("postureUnsupportedTitle", { engine: engineLabel }),
    body: t("postureUnsupportedBody", { engines: engineNames(AGENT_EXECUTION_ENGINES, t), engine: engineLabel }),
  };
}

/**
 * Agent mode with no resolved connection.
 *
 * Blocked, because agent mode cannot execute anything from here - but blocked WITHOUT the
 * engine claim, which is the whole reason this is its own arm rather than
 * `unsupportedPosture("this connection")`. Nothing has been read, so "has no read-only
 * statement path" would be a statement about an engine this panel has not seen; what is true
 * is that it does not know which engine you are on. The caller's `engineLabel` is ignored on
 * purpose: with `engine` null it is a label for nothing.
 */
function unresolvedPosture(t: AgentTranslator): AgentPosture {
  return {
    tone: "blocked",
    headline: t("postureUnresolvedHeadline"),
    qualifier: t("postureUnresolvedQualifier"),
    title: t("postureUnresolvedTitle"),
    body: t("postureUnresolvedBody", { engines: engineNames(AGENT_EXECUTION_ENGINES, t) }),
  };
}

/** Agent mode with the editor hand-over consented: still read-only, and one statement wider. */
function widenedPosture(t: AgentTranslator): AgentPosture {
  return {
    tone: "widened",
    headline: t("postureWidenedHeadline"),
    qualifier: t("postureWidenedQualifier", { rows: AGENT_HANDOVER_BUDGET.maxResultRows }),
    title: t("postureWidenedTitle"),
    body: handoverTerms(STATEMENT_BOUNDS, t),
  };
}

/** Agent mode, executing on its own path and nowhere else. */
function readsPosture(t: AgentTranslator): AgentPosture {
  const rows = STATEMENT_BOUNDS.maxResultRows;
  const seconds = STATEMENT_BOUNDS.statementTimeoutMs / 1000;
  return {
    tone: "reads",
    headline: t("postureReadsHeadline"),
    qualifier: t("postureReadsQualifier", { rows, seconds }),
    title: t("postureReadsTitle"),
    body: t("postureReadsBody", { rows, seconds }),
  };
}

/**
 * The rail's reading of the selected mode, in the order the arms EXCLUDE each other.
 *
 * Plan mode first, because it is engine-independent and the hand-over cannot widen it -
 * there is no statement of the run's to hand over. Then the two arms that know no bounds to
 * state: no connection, and an engine agent mode cannot execute a statement on. Only then
 * does the hand-over matter, which is why a ticked hand-over on an unsupported engine still
 * reads as blocked rather than as widened.
 *
 * `AGENT_EXECUTION_ENGINES` is read on every call, not folded into a constant at module
 * load, so the copy follows the list in the process that is running.
 */
export function agentPosture(
  input: {
    readonly mode: AgentRunMode;
    readonly engine: DatabaseType | null;
    readonly engineLabel: string;
    readonly handover: boolean;
  },
  t: AgentTranslator = englishAgentTranslator,
): AgentPosture {
  if (input.mode === "planning") return planPosture(t);
  if (input.engine === null) return unresolvedPosture(t);
  if (!AGENT_EXECUTION_ENGINES.includes(input.engine)) return unsupportedPosture(input.engineLabel, t);
  return input.handover ? widenedPosture(t) : readsPosture(t);
}
