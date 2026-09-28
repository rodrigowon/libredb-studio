import "../setup-dom";
import { describe, expect, test, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useBottomPanel } from "@/hooks/use-bottom-panel";

describe("useBottomPanel", () => {
  function setup() {
    const hook = renderHook(() => useBottomPanel());
    let collapsed = true;
    const resize = mock(() => { collapsed = false; });
    hook.result.current.bottomPanelProps.panelRef.current = {
      isCollapsed: () => collapsed,
      resize,
      collapse: () => { collapsed = true; },
      expand: () => { collapsed = false; },
      getSize: () => ({ inPixels: collapsed ? 36 : 300, asPercentage: collapsed ? 5 : 60 }),
    };
    return { ...hook, resize, collapse: () => {
      collapsed = true;
      act(() => hook.result.current.bottomPanelProps.onResize({ inPixels: 36, asPercentage: 5 }));
    } };
  }

  test("starts at the navigation height, retaining the expanded minimum", () => {
    const { result, resize, rerender } = setup();
    expect(result.current.isBottomPanelCollapsed).toBe(true);
    expect(result.current.bottomPanelProps.defaultSize).toBe(36);
    expect(result.current.bottomPanelProps.collapsedSize).toBe(36);
    expect(result.current.bottomPanelProps.minSize).toBe("20%");
    rerender();
    expect(resize).not.toHaveBeenCalled();
  });

  for (const mode of ["results", "history", "saved", "charts", "pivot", "dashboard", "docs", "schemadiff", "explain"] as const) {
    test(`explicit ${mode} intent restores the original 60% default`, () => {
      const { result, resize } = setup();
      act(() => result.current.setBottomPanelMode(mode));
      expect(result.current.bottomPanelMode).toBe(mode);
      expect(resize).toHaveBeenCalledWith("60%");
    });
  }

  test("resizing is respected; manual collapse restores the last useful size only on a new intent", () => {
    const { result, resize, collapse, rerender } = setup();
    act(() => result.current.setBottomPanelMode("results"));
    act(() => result.current.bottomPanelProps.onResize({ inPixels: 240, asPercentage: 35 }));
    expect(result.current.isBottomPanelCollapsed).toBe(false);
    act(() => result.current.setBottomPanelMode("history"));
    expect(resize).toHaveBeenCalledTimes(1);
    collapse();
    rerender();
    expect(result.current.isBottomPanelCollapsed).toBe(true);
    expect(resize).toHaveBeenCalledTimes(1);
    act(() => result.current.setBottomPanelMode("results"));
    expect(resize).toHaveBeenLastCalledWith("35%");
  });

  test("capability-driven selection does not open the panel", () => {
    const { result, resize } = setup();
    act(() => result.current.selectMode("results"));
    expect(resize).not.toHaveBeenCalled();
  });

  test("pixel rounding after viewport resize still allows reopening", () => {
    const { result, resize } = setup();
    const panel = result.current.bottomPanelProps.panelRef.current!;
    panel.isCollapsed = () => false;
    panel.getSize = () => ({ inPixels: 36.01, asPercentage: 5.705 });
    act(() => result.current.setBottomPanelMode("results"));
    expect(resize).toHaveBeenCalledWith("60%");
  });
});
