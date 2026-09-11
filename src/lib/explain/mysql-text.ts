import { classifySelectPrefix } from "./select-prefix";
import { INDENT, buildTree, cellText, isRecord, withRoot, type PlanLine } from "./text-plan";
import type { ExplainPlanInput, ExplainStrategy, ExplainTreeNode } from "./types";

// Adapted from e11015ab + 745d0757: first column is the node, others are detail.
// Do not guess metrics from arbitrary numbers in an engine's text plan.
function readEstRows(entries: [string, unknown][]): number | undefined {
  const cell = entries.find(([column]) => column.toLowerCase() === "estrows");
  if (cell === undefined) return undefined;
  const text = cellText(cell[1]).trim();
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toPlanLine(row: Record<string, unknown>): PlanLine | null {
  const entries = Object.entries(row);
  const first = cellText(entries[0]?.[1]);
  const label = first.replace(INDENT, "");
  const indent = first.length - label.length;
  if (label.trim() === "") return null;
  const node: ExplainTreeNode = { label, children: [] };
  const detail = entries
    .slice(1)
    .filter(([, value]) => cellText(value) !== "")
    .map(([column, value]) => `${column}: ${cellText(value)}`)
    .join(", ");
  if (detail !== "") node.detail = detail;
  const estRows = readEstRows(entries);
  if (estRows !== undefined) node.metrics = { estRows };
  return { indent, text: entries.map(([, value]) => cellText(value)).join("  "), node };
}

export const mysqlTextStrategy: ExplainStrategy = {
  format: "mysql-text",
  buildSql(sql, mode) {
    if (mode !== "estimate" || classifySelectPrefix(sql) === null) return null;
    return `EXPLAIN ${sql}`;
  },
  extractPlan(result) {
    return result.rows ?? [];
  },
  toRenderModel(raw): ExplainPlanInput | null {
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isRecord)) return null;
    const lines = raw.map(toPlanLine).filter((line): line is PlanLine => line !== null);
    if (lines.length === 0) return null;
    return { kind: "tree", root: withRoot(buildTree(lines)), raw: lines.map((line) => line.text).join("\n") };
  },
};
