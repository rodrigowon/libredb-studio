"use client";

import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { FkFlowEdge } from "./graph";
import { useEdgeHighlight } from "./highlight-store";

/**
 * FK edge that reads its highlight state from the highlight store instead of
 * edge data, so selecting a table never rebuilds the edges array. The label
 * is only rendered while highlighted - label DOM for every edge is one of the
 * bigger costs on schemas with hundreds of relationships.
 */
export const FkEdge = memo(function FkEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FkFlowEdge>) {
  const highlight = useEdgeHighlight(source, target);
  const geometry = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  // Fixed right-to-left handles: reversed links need the native stepped
  // detour rather than a Bezier doubling back through the table cards.
  const [path, labelX, labelY] = targetX > sourceX
    ? getBezierPath(geometry)
    : getSmoothStepPath({ ...geometry, borderRadius: 24 });

  const heuristic = data?.heuristic === true;
  const stroke = highlight === "highlighted" ? "var(--studio-fg-tertiary)" : "var(--studio-fg-muted)";
  const baseOpacity = heuristic ? 0.45 : 0.65;
  const opacity = highlight === "highlighted" ? 1 : highlight === "dimmed" ? 0.12 : baseOpacity;
  const strokeWidth = highlight === "highlighted" ? 2.5 : heuristic ? 1.5 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke, strokeWidth, opacity, strokeLinecap: "round", strokeLinejoin: "round", strokeDasharray: heuristic ? "4 2" : undefined }}
      />
      {highlight === "highlighted" && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-raised/80 border border-hairline-strong rounded px-1 text-[0.5625rem] text-fg-tertiary pointer-events-none"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {heuristic ? "1:N?" : "1:N"}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
