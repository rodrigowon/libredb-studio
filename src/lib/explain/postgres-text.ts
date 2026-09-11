import { isExplainableUnderPostgresGrammar } from "./postgres-json";
import { INDENT, buildTree, isRecord, withRoot, type PlanLine } from "./text-plan";
import type { ExplainPlanInput, ExplainStrategy } from "./types";

// Adapted from 745d0757. CockroachDB marks nodes with bullets; Materialize
// returns whole plans in one cell. These are output-shape rules, not SQL parsing.
const NODE_MARKER = "•";
interface TextLine {
  readonly indent: number;
  readonly label: string;
  readonly printed: string;
}

function toTextLines(rows: readonly Record<string, unknown>[]): TextLine[] {
  const lines: TextLine[] = [];
  for (const row of rows) {
    const cell = Object.values(row)[0];
    if (typeof cell !== "string") return [];
    for (const printed of cell.split("\n")) {
      const label = printed.replace(INDENT, "");
      if (label.trim() !== "") lines.push({ indent: printed.length - label.length, label, printed });
    }
  }
  return lines;
}

function foldAttributes(lines: readonly TextLine[]): PlanLine[] {
  const folded: PlanLine[] = [];
  const details: string[][] = [];
  for (const line of lines) {
    if (line.label.startsWith(NODE_MARKER) || folded.length === 0) {
      folded.push({ indent: line.indent, text: line.label, node: { label: line.label, children: [] } });
      details.push([]);
    } else details[details.length - 1].push(line.label);
  }
  for (const [index, detail] of details.entries()) {
    if (detail.length > 0) folded[index].node.detail = detail.join(", ");
  }
  return folded;
}

function toRenderModel(raw: unknown): ExplainPlanInput | null {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isRecord)) return null;
  const lines = toTextLines(raw);
  if (lines.length === 0) return null;
  const planLines = lines.some((line) => line.label.startsWith(NODE_MARKER))
    ? foldAttributes(lines)
    : lines.map((line) => ({ indent: line.indent, text: line.label, node: { label: line.label, children: [] } }));
  return { kind: "tree", root: withRoot(buildTree(planLines)), raw: lines.map((line) => line.printed).join("\n") };
}

const readsTextPlans = {
  extractPlan(result: { rows?: Array<Record<string, unknown>> }) {
    return result.rows ?? [];
  },
  toRenderModel,
};

export const postgresTextStrategy: ExplainStrategy = {
  format: "postgres-text",
  buildSql(sql, mode) {
    return mode === "estimate" && isExplainableUnderPostgresGrammar(sql) ? `EXPLAIN ${sql}` : null;
  },
  ...readsTextPlans,
};

export const postgresTextAnalyzeStrategy: ExplainStrategy = {
  format: "postgres-text-analyze",
  buildSql(sql, mode) {
    if (!isExplainableUnderPostgresGrammar(sql)) return null;
    return mode === "analyze" ? `EXPLAIN ANALYZE ${sql}` : `EXPLAIN ${sql}`;
  },
  ...readsTextPlans,
};
