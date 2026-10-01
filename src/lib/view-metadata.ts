import type { ViewSchema } from "./types";

/** The views endpoint distinguishes unsupported from a successful empty inventory. */
export type ViewMetadataResult = { status: "unsupported" } | { status: "ready"; data: ViewSchema[] };

/** Runtime metadata only; table schema, snapshots and Agent context remain separate. */
export type ViewMetadataState =
  | ViewMetadataResult
  | { status: "idle" }
  | { status: "loading"; previous?: ViewSchema[] }
  | { status: "error"; error: string; previous?: ViewSchema[] };
