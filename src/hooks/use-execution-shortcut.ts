"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverSnapshot = () => "Ctrl + Enter";
const clientSnapshot = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘ + Enter" : "Ctrl + Enter";

/** Presentation only; Monaco still owns the CtrlCmd key binding. */
export function useExecutionShortcut() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
