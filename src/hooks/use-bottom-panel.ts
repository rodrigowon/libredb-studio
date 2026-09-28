"use client";

import { useCallback, useRef, useState } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import type { BottomPanelMode } from "@/components/studio/BottomPanel";

// Keep the existing h-9 navigation strip visible even when content is collapsed.
const COLLAPSED_SIZE = 36;

export function useBottomPanel() {
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const [bottomPanelMode, selectMode] = useState<BottomPanelMode>("results");
  const [isBottomPanelCollapsed, setCollapsed] = useState(true);
  const lastUsefulSize = useRef(60);

  const onResize = useCallback((size: PanelSize) => {
    const collapsed = size.inPixels <= COLLAPSED_SIZE + 1;
    setCollapsed(collapsed);
    if (!collapsed) lastUsefulSize.current = size.asPercentage;
  }, []);

  // An explicit intent, not an effect observing SQL, results or loading state.
  // Selecting the already-selected tab must open it too. Completion never reopens it.
  const setBottomPanelMode = useCallback((mode: BottomPanelMode) => {
    selectMode(mode);
    const panel = panelRef.current;
    // Pixel conversion after a viewport resize can differ from the library's
    // exact collapsed percentage. Use the same tolerance as onResize.
    if (panel && panel.getSize().inPixels <= COLLAPSED_SIZE + 1) {
      panel.resize(`${lastUsefulSize.current}%`);
    }
  }, []);

  return {
    bottomPanelMode,
    setBottomPanelMode,
    selectMode,
    isBottomPanelCollapsed,
    bottomPanelProps: {
      panelRef,
      onResize,
      collapsible: true,
      collapsedSize: COLLAPSED_SIZE,
      defaultSize: COLLAPSED_SIZE,
      minSize: "20%",
    },
  };
}
