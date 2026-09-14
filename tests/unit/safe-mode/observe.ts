/** Experimental AST observations, not a classifier. No SQL rewriting or fallback. */
import type { Dialect, SqlCase, StatementExpectation } from "./model";

export interface Candidate {
  name: string;
  version: string;
  dialects: readonly Dialect[];
  parse(sql: string, dialect: Dialect): unknown;
}
export interface AstObservation {
  path: string;
  type: string;
  operation?: string;
  hasWhere?: boolean;
}
export interface Observation {
  id: string;
  outcome: "parsed" | "parse-rejected" | "unsupported";
  roots?: string[];
  nodes?: AstObservation[];
  error?: string;
  comparison?: { operations: boolean; whereOwnership: boolean; topLevelCount: boolean; missingWrite: boolean };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const SIMPLE_OPERATIONS = new Set([
  "select",
  "insert",
  "update",
  "delete",
  "replace",
  "grant",
  "revoke",
  "vacuum",
  "analyze",
  "reindex",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "release",
  "set",
  "attach",
  "detach",
  "pragma",
  "explain",
  "execute",
  "do",
]);

function operation(node: Record<string, unknown>, candidate: string): string | undefined {
  const type = typeof node.type === "string" ? node.type.toLowerCase() : "";
  if (SIMPLE_OPERATIONS.has(type)) return type;
  if (type === "function" || type === "aggr_func" || (candidate === "pgsql-ast-parser" && type === "call"))
    return "function";
  if (type === "call") return "call";
  if (["create", "alter", "drop", "truncate"].includes(type) && typeof node.keyword === "string")
    return `${type}-${node.keyword.toLowerCase()}`;
  if (/^(create|alter|drop|truncate) (table|index|view|database)$/.test(type)) return type.replace(" ", "-");
  return undefined;
}

function inspectAst(ast: unknown, candidate: string): AstObservation[] {
  const observations: AstObservation[] = [];
  // Bounded iterative walk for diagnostics. This is not a dialect-complete AST visitor.
  const pending: Array<[unknown, string]> = [[ast, "$"]];
  let visited = 0;
  while (pending.length) {
    if (++visited > 100_000) throw new Error("AST observation budget exceeded");
    const [value, path] = pending.pop()!;
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) pending.push([value[i], `${path}[${i}]`]);
      continue;
    }
    const node = record(value);
    if (!node) continue;
    const op = operation(node, candidate);
    if (op || node.type === "with") {
      observations.push({
        path,
        type: String(node.type),
        ...(op ? { operation: op } : {}),
        ...(op === "update" || op === "delete" ? { hasWhere: node.where !== null && node.where !== undefined } : {}),
      });
    }
    const entries = Object.entries(node);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, child] = entries[i];
      if (child !== null && typeof child === "object") pending.push([child, `${path}.${key}`]);
    }
  }
  return observations;
}

function flatten(items: StatementExpectation[]): StatementExpectation[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}
function sameMultiset(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function observe(candidate: Candidate, item: SqlCase): Observation {
  if (item.dialect === "unsupported-engine" || !candidate.dialects.includes(item.dialect))
    return { id: item.id, outcome: "unsupported" };
  try {
    // Feed the WHOLE original script to the candidate, not the existing splitter.
    const ast = candidate.parse(item.sql, item.dialect);
    if (ast === null || ast === undefined) throw new Error("No AST returned");
    const nodes = inspectAst(ast, candidate.name);
    const roots = (Array.isArray(ast) ? ast : [ast]).map((root) => String(record(root)?.type ?? "unrecognized-root"));
    const expected = flatten(item.expected.statements);
    const actualOperations = nodes.flatMap((node) => (node.operation ? [node.operation] : []));
    const writes = expected.filter((node) => node.category === "write").map((node) => node.operation);
    return {
      id: item.id,
      outcome: "parsed",
      roots,
      nodes,
      comparison: {
        operations: sameMultiset(
          expected.map((node) => node.operation),
          actualOperations,
        ),
        whereOwnership: sameMultiset(
          expected.filter((node) => node.hasWhere !== undefined).map((node) => `${node.operation}:${node.hasWhere}`),
          nodes.filter((node) => node.hasWhere !== undefined).map((node) => `${node.operation}:${node.hasWhere}`),
        ),
        topLevelCount: roots.length === item.expected.statements.length,
        missingWrite: writes.some((op) => !actualOperations.includes(op)),
      },
    };
  } catch (error) {
    return {
      id: item.id,
      outcome: "parse-rejected",
      error: String(error instanceof Error ? error.message : error)
        .replace(/\s+/g, " ")
        .slice(0, 180),
    };
  }
}
