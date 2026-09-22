import "../setup-dom";
import React from "react";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useExecutionShortcut } from "@/hooks/use-execution-shortcut";

const platformDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
afterEach(() => {
  cleanup();
  if (platformDescriptor) Object.defineProperty(navigator, "platform", platformDescriptor);
  else Reflect.deleteProperty(navigator, "platform");
});

describe("execution shortcut presentation", () => {
  for (const [platform, label] of [["Win32", "Ctrl + Enter"], ["Linux x86_64", "Ctrl + Enter"], ["MacIntel", "⌘ + Enter"]]) {
    test(platform, () => {
      Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
      expect(renderHook(() => useExecutionShortcut()).result.current).toBe(label);
    });
  }

  test("server markup uses a stable default even with a Mac navigator", () => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    function Shortcut() { return <span>{useExecutionShortcut()}</span>; }
    expect(renderToString(<Shortcut />)).toBe("<span>Ctrl + Enter</span>");
  });
});
