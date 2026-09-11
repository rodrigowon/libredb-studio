import type { ExplainTreeNode } from "./types";

// Shared upstream text-plan structure: indentation and box glyphs, not engine names.
export const INDENT = /^[\s│├└─]*/u;

export interface PlanLine {
  readonly indent: number;
  readonly text: string;
  readonly node: ExplainTreeNode;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cellText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function buildTree(lines: readonly PlanLine[]): ExplainTreeNode[] {
  const roots: ExplainTreeNode[] = [];
  const stack: PlanLine[] = [];
  for (const line of lines) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= line.indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent === undefined) roots.push(line.node);
    else parent.node.children.push(line.node);
    stack.push(line);
  }
  return roots;
}

export function withRoot(roots: readonly ExplainTreeNode[]): ExplainTreeNode {
  return roots.length === 1 ? roots[0] : { label: "EXPLAIN", children: [...roots] };
}
