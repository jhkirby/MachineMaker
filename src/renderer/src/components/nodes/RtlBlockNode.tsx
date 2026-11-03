/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { memo, useCallback } from "react";
import { Handle, type NodeProps } from "@xyflow/react";
import {
  formatBusWidth,
  isClockPort,
  type RtlBlock,
  type RtlPort,
} from "../../../../shared/diagram-model";
import {
  blockKindLabel,
  resolvePalette,
  withAlpha,
} from "../../model/block-appearance";
import { GRID_SIZE } from "../../model/grid";
import {
  resolvePortPairConnection,
  sideToPosition,
  type RtlBlockNode as RtlBlockNodeType,
} from "../../model/flow-adapters";
import { portPitchCells } from "../../model/port-layout";
import { describeSignalValue, formatSignalValue } from "../../model/signal-values";
import { useDiagramStore } from "../../state/diagram-store";
import { VALUE_TAG_GAP } from "../../model/value-tags";
import { useSimulationStore } from "../../state/simulation-store";

/**
 * Where a port's simulated-value tag sits: just outside the block, beside
 * the port's bubble — the opposite side from its name label, which is
 * inside — so the two never overlap.
 *
 * @param block - The owning block.
 * @param port - The port.
 * @returns Absolute-position styles relative to the block.
 */
function valueTagLayout(block: RtlBlock, port: RtlPort): React.CSSProperties {
  const along = `${port.slot * portPitchCells(block, port.side) * GRID_SIZE}px`;
  const outside = `calc(100% + ${VALUE_TAG_GAP}px)`;
  switch (port.side) {
    case "left":
      return { top: along, right: outside, transform: "translateY(-50%)" };
    case "right":
      return { top: along, left: outside, transform: "translateY(-50%)" };
    case "top":
      return { left: along, bottom: outside, transform: "translateX(-50%)" };
    case "bottom":
      return { left: along, top: outside, transform: "translateX(-50%)" };
  }
}
import GateSymbol, {
  canonicalInputAlong,
  gateInputEdgeOffset,
  gateInputLabelExtra,
  gateOutputLabelInset,
  placementFor,
} from "./GateSymbol";

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
  const alongPx = port.slot * portPitchCells(block, port.side) * GRID_SIZE;
  const along = `${alongPx}px`;
  const baseInset = isClock
    ? CLOCK_TRIANGLE_DEPTH + CLOCK_LABEL_GAP
    : horizontal
      ? 10
      : 8;
  // A gate's output label has to clear the body's own narrowing tip (and a
  // negation bubble) rather than just the block edge — see
  // gateOutputLabelInset.
  const inset =
    block.kind === "gate" && port.direction === "out"
      ? (() => {
          const { localW, localH } = placementFor(
            block.gateRotation ?? "right",
            block.width,
            block.height,
          );
          return gateOutputLabelInset(
            block.gateType ?? "AND",
            localW,
            localH,
            baseInset,
          );
        })()
      : block.kind === "gate"
        ? baseInset + gateInputLabelExtra(block.gateType ?? "AND")
        : baseInset;
  // A gate's input face is a curve (every type but AND/NAND), not a flat
  // edge — GateSymbol still draws that curve to fill exactly the block's own
  // box (see MARGIN there), so it only meets the flat edge every port is
  // otherwise centered on at the very top/bottom corners. This is how far to
  // additionally push a gate's own input port in (or, negative, out) from
  // that flat edge so it lands on the curve's actual boundary at its own
  // height instead — 0 for every other kind, and for a gate's own output
  // (always a single point exactly at the flat edge already). See
  // GateSymbol's gateInputEdgeOffset for the geometry this mirrors.
  const gateEdgeOffset =
    block.kind === "gate" && port.direction === "in"
      ? (() => {
          const { localW, localH } = placementFor(
            block.gateRotation ?? "right",
            block.width,
            block.height,
          );
          const canonicalAlong = canonicalInputAlong(
            block.gateRotation ?? "right",
            localH,
            alongPx,
          );
          return gateInputEdgeOffset(
            block.gateType ?? "AND",
            localW,
            localH,
            canonicalAlong,
          );
        })()
      : 0;
  // translateZ(0) alongside the real positioning translate promotes this
  // label onto its own GPU layer permanently, from its very first render —
  // deliberately not toggled by anything hover-driven, unlike the filter()
  // .rtl-block::before's own comment describes and avoids for that exact
  // reason: a layer that only appears right as a transition starts forces a
  // fresh rasterization of whatever's on it at that instant, reading as a
  // visible jump. The block's own hover-lighten (::before) and a port's
  // hover transitions (background/box-shadow/border-color, all on
  // .rtl-port) repaint the pixels directly behind/beside this label on
  // every frame they run; without its own stable layer, Chromium was
  // re-rasterizing this label's glyphs right along with them each time —
  // most visible in dark mode, where the swing from a near-black fill to
  // the hover-lighten tint is largest. Promoted once up front, this label's
  // glyphs rasterize a single time, and every later frame is a cheap
  // recomposite instead, regardless of what changes around it.
  if (horizontal) {
    return {
      handle: { top: along, [port.side]: gateEdgeOffset } as React.CSSProperties,
      label: {
        top: along,
        [port.side]: inset + gateEdgeOffset,
        transform: "translateY(-50%) translateZ(0)",
        textAlign: port.side === "left" ? "left" : "right",
      } as React.CSSProperties,
    };
  }
  return {
    handle: { left: along, [port.side]: gateEdgeOffset } as React.CSSProperties,
    label: {
      left: along,
      [port.side]: inset + gateEdgeOffset,
      transform: "translateX(-50%) translateZ(0)",
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
  const palette = resolvePalette(block, theme);

  const diagram = useDiagramStore((s) => s.diagram);
  const armedPort = useDiagramStore((s) => s.armedPort);
  const simulating = useDiagramStore((s) => s.mode === "simulate");
  const simulatedValues = useSimulationStore((s) => s.ports);
  const hiddenTags = useSimulationStore((s) => s.hiddenTags);
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
      // A tied-off port can't take a wire, so it can't start one either.
      if (!armedPort && port.tiedOff) {
        return;
      }
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

  const isGate = block.kind === "gate";

  return (
    <div
      className={`rtl-block${isGate ? " is-gate" : ""}${selected ? " is-selected" : ""}`}
      style={
        {
          // A gate draws its own filled/stroked outline (GateSymbol, below)
          // instead of this div's usual plain rounded rect — see the
          // .rtl-block.is-gate rule (app.css) that blanks out `background`
          // and `--block-outline` there, since a real AND/OR/XOR silhouette
          // painted underneath a still-visible rectangular fill+border would
          // just show as a second, wrong outline around the real one.
          background: isGate ? undefined : palette.fill,
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
          // A translucent version of the same stroke, for the armed/
          // connectable port glow (app.css) — so that halo is always this
          // block's own color, not a second, unrelated one.
          "--block-stroke-glow": withAlpha(palette.stroke, 0.35),
          color: palette.text,
        } as React.CSSProperties
      }
    >
      {isGate ? (
        <GateSymbol
          type={block.gateType ?? "AND"}
          rotation={block.gateRotation ?? "right"}
          width={block.width}
          height={block.height}
          fill={palette.fill}
          stroke={palette.stroke}
          selected={!!selected}
        />
      ) : null}

      <div className="rtl-block__header">
        <div className="rtl-block__title">{block.label}</div>
        <div className="rtl-block__kind" style={{ color: palette.stroke }}>
          {blockKindLabel(block)}
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
        // Every other port while one is armed: wrong direction, or a
        // mismatched bus width (see resolvePortPairConnection) — a click
        // here can never complete the connection, so hovering it warns
        // rather than echoing the armed port's own "this would work" glow.
        const isIncompatible = !!armedPort && !isArmed && !isConnectable;
        const portClassName = [
          "rtl-port",
          `rtl-port--${port.direction}`,
          isClock ? "rtl-port--clock" : "",
          port.tiedOff ? "rtl-port--tied" : "",
          isArmed ? "rtl-port--armed" : "",
          isConnectable ? "rtl-port--connectable" : "",
          isIncompatible ? "rtl-port--incompatible" : "",
        ]
          .filter(Boolean)
          .join(" ");
        // An "inout" port can be either end of a wire, but a single Handle
        // can only ever be one — React Flow keys its handle registry by
        // (node, handle id, type), so two Handles sharing this same id, one
        // of each type, stacked exactly on top of each other, is how a port
        // offers both without becoming two visually distinct ports. clk/
        // reset are always "in" (see component-library.ts), so this never
        // has to coexist with the clock-triangle glyph below.
        const handleTypes: Array<"source" | "target"> =
          port.direction === "inout"
            ? ["source", "target"]
            : [port.direction === "out" ? "source" : "target"];
        return (
          <div key={port.id}>
            {handleTypes.map((type) => (
              <Handle
                key={`${port.id}-${type}`}
                id={port.id}
                type={type}
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
                // Click-to-connect (handlePortClick, above) fully replaces
                // React Flow's own pointerdown-drag connect gesture; without
                // these the "connectionindicator" class it relies on for
                // pointer-events would still gate on isConnectableStart, so
                // app.css grants .rtl-port pointer-events directly instead.
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
            ))}
            <span className="rtl-port__label" style={layout.label}>
              {port.name}
              {formatBusWidth(port.width) ? (
                <em> {formatBusWidth(port.width)}</em>
              ) : null}
            </span>
            {simulating &&
            !port.tiedOff &&
            !hiddenTags.has(`${block.id}/${port.id}`) ? (
              // The value on this port's wire, beside its bubble.
              (() => {
                const value = simulatedValues.get(`${block.id}/${port.id}`);
                return (
                  <span
                    className={`rtl-port__value${value === undefined ? " is-unknown" : ""}`}
                    style={valueTagLayout(block, port)}
                    title={`${port.name}: ${describeSignalValue(value, port.width ?? 1)}`}
                  >
                    {formatSignalValue(value)}
                  </span>
                );
              })()
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default memo(RtlBlockNodeComponent);
