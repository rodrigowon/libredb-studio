"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DatabaseConnection } from "@/lib/types";
import type { ViewMetadataResult, ViewMetadataState } from "@/lib/view-metadata";

type ViewScope = DatabaseConnection | string | null;
type ViewLoader = (connection: DatabaseConnection) => Promise<ViewMetadataResult>;

const previousData = (state: ViewMetadataState) =>
  state.status === "ready"
    ? state.data
    : state.status === "loading" || state.status === "error"
      ? state.previous
      : undefined;

/** Narrow shared ownership for views, independent of either table schema controller. */
export function useViewMetadata(scope: ViewScope, load?: ViewLoader) {
  const supported = !!load;
  const initialState: ViewMetadataState = supported ? { status: "idle" } : { status: "unsupported" };
  const [record, setRecord] = useState<{ scope: ViewScope; supported: boolean; state: ViewMetadataState }>({
    scope,
    supported,
    state: initialState,
  });
  const generation = useRef(0);

  // Adjust during render so a previous connection's data is never exposed for a new scope.
  // Embedded scopes are IDs to preserve the host's existing same-ID reload semantics.
  if (record.scope !== scope || record.supported !== supported) {
    setRecord({ scope, supported, state: initialState });
  }

  useLayoutEffect(() => {
    return () => {
      generation.current += 1;
    };
    // Scope/support changes invalidate external requests; cleanup reads neither value.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    // Scope/support changes invalidate external requests; cleanup reads neither value.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [scope, supported]);

  const fetchViews = useCallback(
    async (connection: DatabaseConnection) => {
      const requestScope = typeof scope === "string" ? connection.id : connection;
      if (!load || scope === null || requestScope !== scope) return;
      const currentGeneration = ++generation.current;
      const isCurrent = () => currentGeneration === generation.current;
      setRecord((prev) => ({
        scope,
        supported,
        state: { status: "loading", previous: previousData(prev.state) },
      }));
      try {
        const result = await load(connection);
        if (!isCurrent()) return;
        setRecord((prev) => (isCurrent() ? { scope, supported, state: result } : prev));
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : String(error);
        setRecord((prev) =>
          isCurrent()
            ? { scope, supported, state: { status: "error", error: message, previous: previousData(prev.state) } }
            : prev,
        );
      }
      // No independent finally flag: only the current request can leave loading.
    },
    [scope, supported, load],
  );

  return { views: record.state, fetchViews };
}
