/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import { memo, useCallback } from "react";
import { Handle, type NodeProps } from "@xyflow/react";
import {
  formatBusWidth,
  isClockPort,
  type RtlBlock,
  type RtlPort,
} from "../../../../shared/diagram-model";
import { paletteFor } from "../../model/block-appearance";
import { GRID_SIZE } from "../../model/grid";
import {
  resolvePortPairConnection,
  sideToPosition,
  type RtlBlockNode as RtlBlockNodeType,
} from "../../model/flow-adapters";
import { portPitchCells } from "../../model/port-layout";
import { useDiagramStore } from "../../state/diagram-store";

/** Gap, in px, between the clock triangle and its label. */
const CLOCK_LABEL_GAP = 6;

/**
 * How far the clock triangle reaches from the block's border, in px — the
 * same in every orientation (see the "15" in .rtl-port--clock's width/height
 * in app.css, whichever one is the border-perpendicular axis for that side).
 * Used to clear the triangle when placing its label.
 */
const CLOCK_TRIANGLE_DEPTH = 15;

/**
 * SVG viewBox and outline points for the clock triangle on each side, one
 * coordinate unit per pixel of the handle box it fills (15x22 for left/right,
 * 22x15 for top/bottom — see .rtl-port--clock in app.css). Points are ordered
 * base-corner, tip, base-corner and drawn as a `<polyline>` rather than a
 * closed `<polygon>`, so only the two slanted sides are stroked — the base
 * itself sits flush against the block's own border, and stroking it too
 * would draw a second, slightly offset line right next to that border,
 * reading as an unwanted "double border". The base corners' path points sit
 * half a stroke-width in from the box edge that touches the border, so the
 * OUTER edge of that 2px-wide stroke — not its centerline — lands exactly on
 * the border: centering the path itself on the border would let half the
 * stroke bleed past it into the canvas on the other side. Only the tip end
 * (which points inward, away from the border) is inset further, purely to
 * size how far it reaches into the block.
 */
const CLOCK_TRIANGLE: Record<
  RtlPort["side"],
  { viewBox: string; points: string }
> = {
  left: { viewBox: "0 0 15 22", points: "1,2 13,11 1,20" },
  right: { viewBox: "0 0 15 22", points: "14,2 2,11 14,20" },
  top: { viewBox: "0 0 22 15", points: "2,1 11,13 20,1" },
  bottom: { viewBox: "0 0 22 15", points: "2,14 11,2 20,14" },
};

/**
 * Points for the clock triangle's hover fill — the same shape as
 * {@link CLOCK_TRIANGLE} but held back a further px from the border-side
 * edge, clear of the block's own 1.5px border stroke (.rtl-block's
 * `--block-outline`). A child element always paints on top of its parent's
 * box-shadow, so without this gap the fill would paint straight over the
 * border and visibly dim it right where the triangle meets the block.
 */
const CLOCK_TRIANGLE_FILL: Record<RtlPort["side"], string> = {
  left: "2,2 13,11 2,20",
  right: "13,2 2,11 13,20",
  top: "2,2 11,13 20,2",
  bottom: "2,13 11,2 20,13",
};

/**
 * CSS `clip-path` value restricting a clock port's hit box to its actual
 * triangle, so hovering (or clicking) the rest of the rectangular handle box
 * — which is bigger than the drawn shape, to give the triangle room — has no
 * effect. Reuses {@link CLOCK_TRIANGLE}'s own outline points so the clip
 * region can't drift out of sync with what's actually drawn.
 *
 * @param side - Which side the clock port sits on.
 * @returns A `polygon(...)` clip-path string in the handle box's own pixels.
 */
function clockClipPath(side: RtlPort["side"]): string {
  const corners = CLOCK_TRIANGLE[side].points
    .split(" ")
    .map((pair) => pair.split(",").map((n) => `${n}px`).join(" "))
    .join(", ");
  return `polygon(${corners})`;
}

/**
 * Position a port's handle and its name label along the correct block edge.
 * The handle sits exactly `slot` pitch-steps in from the side's starting
 * corner — one grid cell per step on the left/right edges, where each port's
 * label stacks on its own row, but {@link portPitchCells}'s wider,
 * measured-to-fit step on top/bottom, where labels instead run sideways off
 * the dot and so need enough room between neighbors to stay clear of each
 * other (the block itself is sized to have that room — see minBlockSize in
 * port-layout — so nothing here needs to clip a long name). A clock's label
 * (see isClockPort in RtlBlockNode) sits past the triangle's tip rather than
 * just past a normal port's dot — same side, same direction, just a bigger
 * inset to clear the triangle's full depth instead of the dot's.
 *
 * @param block - The port's owning block, for the top/bottom pitch.
 * @param port - The port being placed.
 * @param isClock - Whether this is the block's clock port.
 * @returns Inline styles for the handle and its label.
 */
function portLayout(
  block: RtlBlock,
  port: RtlPort,
  isClock: boolean,
): {
  handle: React.CSSProperties;
  label: React.CSSProperties;
} {
  const horizontal = port.side === "left" || port.side === "right";
  const along = `${port.slot * portPitchCells(block, port.side) * GRID_SIZE}px`;
  const inset = isClock ? CLOCK_TRIANGLE_DEPTH + CLOCK_LABEL_GAP : horizontal ? 10 : 8;
  if (horizontal) {
    return {
      handle: { top: along },
      label: {
        top: along,
        [port.side]: inset,
        transform: "translateY(-50%)",
        textAlign: port.side === "left" ? "left" : "right",
      } as React.CSSProperties,
    };
  }
  return {
    handle: { left: along },
    label: {
      left: along,
      [port.side]: inset,
      transform: "translateX(-50%)",
      textAlign: "center",
    } as React.CSSProperties,
  };
}

/**
 * Custom React Flow node that draws one RTL block with its typed ports.
 *
 * @param props - React Flow node props; `data.block` carries the RTL block.
 * @returns The rendered block element.
 */
function RtlBlockNodeComponent({ data, selected }: NodeProps<RtlBlockNodeType>) {
  const { block } = data;
  // Invalid-placement-while-dragging is styled via a CSS rule keyed off the
  // node's top-level `className` (set in DiagramCanvas), not through this
  // component's own props: React Flow does not reliably re-render a node's
  // `data`-driven output on every frame of its own drag, only top-level
  // fields like `className`/`zIndex` — see the "DRAG INVALID PLACEMENT" rule
  // in app.css for the actual override.
  const theme = useDiagramStore((s) => s.theme);
  const palette = paletteFor(block.kind, theme);

  const diagram = useDiagramStore((s) => s.diagram);
  const armedPort = useDiagramStore((s) => s.armedPort);
  const setArmedPort = useDiagramStore((s) => s.setArmedPort);
  const connect = useDiagramStore((s) => s.connect);

  // Click-to-connect: the first port clicked anywhere arms it (see the
  // "rtl-port--armed" ring below); a second click on a compatible port
  // completes the wire; re-clicking the armed port itself cancels it; any
  // other click (an incompatible port, a block, the pane) is a no-op that
  // leaves the arm standing — only Escape (see DiagramCanvas) also cancels.
  const handlePortClick = useCallback(
    (port: RtlPort) => {
      const here = { blockId: block.id, portId: port.id };
      if (!armedPort) {
        setArmedPort(here);
        return;
      }
      if (armedPort.blockId === here.blockId && armedPort.portId === here.portId) {
        setArmedPort(null);
        return;
      }
      const connection = resolvePortPairConnection(diagram, armedPort, here);
      if (connection) {
        connect(connection);
        setArmedPort(null);
      }
    },
    [armedPort, block.id, connect, diagram, setArmedPort],
  );

  return (
    <div
      className={`rtl-block${selected ? " is-selected" : ""}`}
      style={
        {
          background: palette.fill,
          // Read by the CSS `--block-outline` custom property (app.css,
          // "INSPECTOR" — see the `.rtl-block` rule) rather than the `border`
          // shorthand: a real `border` insets the padding box every handle
          // below measures `top`/`left`/`right` against, pulling each one a
          // border-width off the exact grid point portPosition() computes.
          // An inset box-shadow paints an identical-looking ring without
          // touching the box model, so the handles stay children of this div
          // (keeping their click-to-connect hit-testing intact) while still
          // landing exactly on the grid.
          "--block-stroke": palette.stroke,
          color: palette.text,
        } as React.CSSProperties
      }
    >
      <div className="rtl-block__header">
        <div className="rtl-block__title">{block.label}</div>
        <div className="rtl-block__kind" style={{ color: palette.stroke }}>
          {block.kind}
        </div>
      </div>

      {block.ports.map((port) => {
        const isClock = isClockPort(port);
        const layout = portLayout(block, port, isClock);
        const isArmed =
          armedPort?.blockId === block.id && armedPort.portId === port.id;
        const isConnectable =
          !!armedPort &&
          !isArmed &&
          resolvePortPairConnection(diagram, armedPort, {
            blockId: block.id,
            portId: port.id,
          }) !== null;
        const portClassName = [
          "rtl-port",
          `rtl-port--${port.direction}`,
          isClock ? "rtl-port--clock" : "",
          isArmed ? "rtl-port--armed" : "",
          isConnectable ? "rtl-port--connectable" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={port.id}>
            <Handle
              id={port.id}
              type={port.direction === "out" ? "source" : "target"}
              position={sideToPosition(port.side)}
              style={
                isClock
                  ? { ...layout.handle, clipPath: clockClipPath(port.side) }
                  : layout.handle
              }
              className={portClassName}
              // Read by the .rtl-port--clock CSS rules to orient the clock
              // triangle so its tip always points into the block regardless
              // of which edge it sits on.
              data-side={port.side}
              // Click-to-connect (handlePortClick, above) fully replaces React
              // Flow's own pointerdown-drag connect gesture; without these the
              // "connectionindicator" class it relies on for pointer-events
              // would still gate on isConnectableStart, so app.css grants
              // .rtl-port pointer-events directly instead.
              isConnectableStart={false}
              isConnectableEnd={false}
              onClick={(event) => {
                event.stopPropagation();
                handlePortClick(port);
              }}
            >
              {isClock ? (
                <svg
                  className="rtl-port--clock__glyph"
                  viewBox={CLOCK_TRIANGLE[port.side].viewBox}
                  preserveAspectRatio="none"
                >
                  <polygon
                    className="rtl-port--clock__fill"
                    points={CLOCK_TRIANGLE_FILL[port.side]}
                  />
                  <polyline
                    points={CLOCK_TRIANGLE[port.side].points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </Handle>
            <span className="rtl-port__label" style={layout.label}>
              {port.name}
              {formatBusWidth(port.width) ? (
                <em> {formatBusWidth(port.width)}</em>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default memo(RtlBlockNodeComponent);
