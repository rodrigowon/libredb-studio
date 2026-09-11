import type { ExplainMode } from "./types";

/** Stable API codes; the client localizes these, never SQL or engine messages. */
export const EXPLAIN_ERRORS = {
  EXPLAIN_INVALID_REQUEST: 'explain must be an object with mode "estimate" or "analyze".',
  EXPLAIN_UNSUPPORTED: "This server does not support the requested EXPLAIN mode.",
  EXPLAIN_STATEMENT_UNSUPPORTED: "Only a single explainable SELECT statement is supported.",
  EXPLAIN_FORMAT_UNSUPPORTED: "The server returned an unsupported EXPLAIN format.",
} as const;
export type ExplainErrorCode = keyof typeof EXPLAIN_ERRORS;

export function isExplainErrorCode(value: unknown): value is ExplainErrorCode {
  return typeof value === "string" && Object.hasOwn(EXPLAIN_ERRORS, value);
}

export function readExplainRequest(value: unknown): { mode: ExplainMode } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!Object.hasOwn(value, "mode") || Object.keys(value).some((key) => key !== "mode")) return null;
  const mode = (value as { mode?: unknown }).mode;
  return mode === "estimate" || mode === "analyze" ? { mode } : null;
}
