/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import {
  BUS_COLOR,
  selectionColorFor,
  WIRE_COLOR,
} from "../../model/block-appearance";
import type { RtlWireEdge as RtlWireEdgeType } from "../../model/flow-adapters";
import { useDiagramStore } from "../../state/diagram-store";
import { midpointOfPolyline, routeToPath } from "../../model/wire-router";

/**
 * Custom React Flow edge for an RTL wire. When the router has supplied an
 * orthogonal route the wire follows the grid (with hop arcs over older wires);
 * otherwise — e.g. mid-drag — it falls back to a bezier so it still draws.
 *
 * @param props - React Flow edge props; `data.wire` and `data.route` carry the
 *   model wire and its routed polyline.
 * @returns The rendered edge.
 */
export default function RtlWireEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  selected,
}: EdgeProps<RtlWireEdgeType>) {
  const theme = useDiagramStore((s) => s.theme);
  const wire = data?.wire;
  const route = data?.route;
  const isBus = Boolean(data?.isBus);
  const color = selected
    ? selectionColorFor(theme)
    : isBus
      ? BUS_COLOR
      : WIRE_COLOR;
  const strokeWidth = isBus ? 3 : 1.5;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (route && route.points.length >= 2) {
    // Use the router's own endpoints verbatim rather than React Flow's
    // sourceX/sourceY: React Flow's getHandlePosition() deliberately reports a
    // Left/Right/Top/Bottom handle's *outer* edge (e.g. `x + width` on the
    // right), not its center, reaching outward by half the handle's own
    // rendered size — a convention that fits a generic connector dot but not
    // our grid-routed wires. The router's `from`/`to` (see wire-router.ts) are
    // portPosition() itself, which is exactly where the dot is centered, so
    // trusting them keeps every corner a true 90° turn instead of drifting a
    // few pixels diagonal right at the handle. Both diagram-state updates
    // (moveBlock etc.) and this route recompute synchronously off the same
    // store change, so there's no drag-time gap to guard against by pinning.
    const points = route.points;
    path = routeToPath({ points, hops: route.hops });
    const mid = midpointOfPolyline(points);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  return (
    <>
      <BaseEdge
        path={path}
        className={`rtl-wire-path${selected ? " rtl-wire-path--selected" : ""}`}
        style={{ stroke: color, strokeWidth, fill: "none" }}
      />
      {wire?.label ? (
        <EdgeLabelRenderer>
          <div
            className="rtl-wire__label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color,
            }}
          >
            {wire.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
