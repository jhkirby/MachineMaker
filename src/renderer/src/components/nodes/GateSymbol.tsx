/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-22
 * --------------------------------------------------------------------------- */

import { useId } from "react";
import type { GateRotation, GateType } from "../../../../shared/diagram-model";

/** Clear space, in px, kept between the block's own border and the symbol —
 * zero, so the drawn body reaches exactly to the block's own edges, the same
 * edges every port's handle is centered on (RtlBlockNode.tsx). Any positive
 * value here would pull the body inward while the ports stay put, leaving
 * each one floating short of the border instead of sitting on it the way a
 * non-gate kind's ports do against its plain rectangular edge. */
const MARGIN = 0;

/** Radius, in px, of the small negation bubble NAND/NOR/XNOR draw at their
 * output tip. */
const BUBBLE_RADIUS = 4;

/** Visible thickness, in px, of a selected gate's ring — matches the 3px
 * every other kind's own selection ring uses (.rtl-block.is-selected::after,
 * app.css). */
const SELECTION_RING_WIDTH = 3;

/** How far left of the body's own back edge XOR/XNOR's extra back line sits
 * (see {@link gateGeometry}'s `backLine`) — the line an input wire actually
 * meets, since it's drawn in front of (further out than) the body's own back
 * curve. */
const XOR_BACK_LINE_GAP = 6;

/** Which gate types draw a bubble at their output tip. */
function isNegated(type: GateType): boolean {
  return type === "NAND" || type === "NOR" || type === "XNOR";
}

/** Which gate types are in the OR family (curved body) rather than the AND
 * family (flat-left D shape). */
function isOrFamily(type: GateType): boolean {
  return type === "OR" || type === "NOR" || type === "XOR" || type === "XNOR";
}

/** Whether a type draws XOR/XNOR's extra back line (see {@link
 * XOR_BACK_LINE_GAP}) — the OR family's other two members (OR, NOR) have
 * only their body's own back curve for an input wire to meet. */
function hasBackLine(type: GateType): boolean {
  return type === "XOR" || type === "XNOR";
}

/**
 * How far the OR family's back curve bows into the body at some height,
 * measured from the flat `x0` an AND-family body's own left edge sits on —
 * 0 at the very top/bottom corners, maximum at the vertical center, per the
 * single quadratic Bézier {@link gateGeometry} draws for that curve (its
 * control point's y is exactly the curve's own midpoint, which collapses the
 * curve's y(t) to a plain linear ramp — see the derivation this reproduces —
 * so `t` here is just the fraction of the way down the curve `y` sits).
 *
 * @param y - Height along the curve, 0 to `localH`.
 * @param localH - The gate's local (pre-rotation) height its curve spans.
 * @param backBulge - How far the curve bows in at its own vertical center.
 * @returns The curve's own x, at `y`, as an offset from `x0`.
 */
function backCurveOffset(y: number, localH: number, backBulge: number): number {
  const t = localH > 0 ? Math.min(1, Math.max(0, y / localH)) : 0;
  return 2 * t * (1 - t) * backBulge;
}

/** One gate body's geometry, in the symbol's own local (unrotated,
 * pointing-right) coordinate space. */
interface GateGeometry {
  /** The filled body outline. */
  body: string;
  /** XOR/XNOR's extra unfilled curve just behind the body's own back edge,
   * or null for every other type. */
  backLine: string | null;
  /** Where the body's own drawn edge ends, before any negation bubble. */
  tipX: number;
  /** Vertical center — every path is drawn symmetric about this. */
  midY: number;
}

/**
 * Compute the local, always-"pointing right" path data for a gate body sized
 * to fit a `w`×`h` box — the AND family draws a flat-left, D-shaped body (a
 * straight edge plus a semicircle); the OR family (OR/NOR/XOR/XNOR) draws
 * the usual concave-back, pointed-tip shield, with XOR/XNOR adding a second
 * free-floating curve just behind it. A negated type (NAND/NOR/XNOR) reports
 * its {@link GateGeometry.tipX} short of `w` by {@link BUBBLE_RADIUS}*2, the
 * room GateSymbol needs to draw the bubble without the whole symbol growing
 * past its box.
 *
 * @param type - Which gate this is.
 * @param w - Local width (the pointing/input-to-output axis) in px.
 * @param h - Local height (perpendicular) in px.
 * @returns The path data to draw this gate's body (and, for XOR/XNOR, its
 *   extra back line).
 */
function gateGeometry(type: GateType, w: number, h: number): GateGeometry {
  const yTop = MARGIN;
  const yBot = h - MARGIN;
  const midY = h / 2;
  const rightMargin = MARGIN + (isNegated(type) ? BUBBLE_RADIUS * 2 : 0);
  const x0 = MARGIN;
  const x1 = w - rightMargin;

  if (isOrFamily(type)) {
    const span = x1 - x0;
    const backBulge = span * 0.25;
    const frontReach = span * 0.55;
    const body =
      `M ${x0} ${yTop} ` +
      `Q ${x0 + backBulge} ${midY} ${x0} ${yBot} ` +
      `Q ${x0 + frontReach} ${yBot} ${x1} ${midY} ` +
      `Q ${x0 + frontReach} ${yTop} ${x0} ${yTop} Z`;
    const backLine = hasBackLine(type)
      ? `M ${x0 - XOR_BACK_LINE_GAP} ${yTop} ` +
        `Q ${x0 - XOR_BACK_LINE_GAP + backBulge} ${midY} ${x0 - XOR_BACK_LINE_GAP} ${yBot}`
      : null;
    return { body, backLine, tipX: x1, midY };
  }

  // AND family: a flat left edge, a straight top/bottom run, and a
  // semicircular right edge exactly as tall as the body itself.
  const radius = (yBot - yTop) / 2;
  const straightEndX = x1 - radius;
  const body =
    `M ${x0} ${yTop} L ${straightEndX} ${yTop} ` +
    `A ${radius} ${radius} 0 0 1 ${straightEndX} ${yBot} ` +
    `L ${x0} ${yBot} Z`;
  return { body, backLine: null, tipX: x1, midY };
}

/**
 * The affine transform (plus the local box it's computed for) that maps a
 * gate's canonical "pointing right" geometry onto the block's true `w`×`h`
 * pixel box for a given rotation. `"right"` needs no transform at all;
 * `"left"` is a horizontal mirror; `"up"`/`"down"` swap which of the block's
 * own width/height is the symbol's local pointing axis, then rotate that
 * swapped box a quarter turn back into the true, unswapped `w`×`h` footprint
 * — the only way a 90° turn lands exactly on the block's actual (generally
 * non-square) bounds instead of over- or under-hanging them.
 *
 * @param rotation - The gate's chosen rotation.
 * @param w - The block's true width, in px.
 * @param h - The block's true height, in px.
 * @returns The local box to draw the canonical geometry in, and the SVG
 *   `transform` that places it correctly.
 */
export function placementFor(
  rotation: GateRotation,
  w: number,
  h: number,
): { localW: number; localH: number; transform: string | undefined } {
  switch (rotation) {
    case "left":
      return { localW: w, localH: h, transform: `translate(${w}, 0) scale(-1, 1)` };
    case "down":
      return { localW: h, localH: w, transform: `translate(${w}, 0) rotate(90)` };
    case "up":
      return { localW: h, localH: w, transform: `translate(0, ${h}) rotate(-90)` };
    case "right":
    default:
      return { localW: w, localH: h, transform: undefined };
  }
}

/**
 * How far a gate's input port should be pushed in from the block's own flat
 * edge (or, for a value below zero, pushed out past it instead) so it lands
 * exactly on the drawn body's own boundary at that port's height, rather than
 * floating in front of it — the AND family's input edge already runs flush
 * along the block's own edge (0 for every port), but the OR family's is a
 * curve that only touches that edge at its very top and bottom corners
 * (RtlBlockNode.tsx draws every port centered on the flat edge itself,
 * regardless of kind, so a gate's curved boundary needs to be met at each
 * port's own position rather than moving the ports to a fixed corner).
 * XOR/XNOR meet their own extra outer back line here instead of the body's
 * own back curve (see {@link XOR_BACK_LINE_GAP}) — that line, not the body
 * edge sitting a few px behind it, is what an input wire actually reaches.
 *
 * `along` and `localH` must already be in the same "canonical" (pre-rotation,
 * pointing-right) frame {@link gateGeometry} draws in — see
 * {@link canonicalInputAlong} for converting a real, post-rotation port
 * position into that frame.
 *
 * @param type - Which gate this is.
 * @param localW - The gate's local (pre-rotation) width — see
 *   {@link placementFor}.
 * @param localH - The gate's local (pre-rotation) height that the input
 *   side's ports run along — see {@link placementFor}.
 * @param canonicalAlong - The port's own position, in the same local frame,
 *   from 0 to `localH`.
 * @returns The offset, in px, to add to the port's position on its flat
 *   edge — 0 for the AND family, where none of this applies.
 */
export function gateInputEdgeOffset(
  type: GateType,
  localW: number,
  localH: number,
  canonicalAlong: number,
): number {
  if (!isOrFamily(type)) {
    return 0;
  }
  const rightMargin = MARGIN + (isNegated(type) ? BUBBLE_RADIUS * 2 : 0);
  const span = localW - MARGIN - rightMargin;
  const backBulge = span * 0.25;
  const bodyOffset = backCurveOffset(canonicalAlong, localH, backBulge);
  return hasBackLine(type) ? bodyOffset - XOR_BACK_LINE_GAP : bodyOffset;
}

/**
 * Convert a gate input port's real, post-rotation position along its side
 * (RtlBlockNode's own `along` — px from that side's starting corner) into
 * the canonical, pre-rotation frame {@link gateGeometry} and
 * {@link gateInputEdgeOffset} both work in. For every rotation but `"down"`,
 * the input side's own axis already runs the same direction as the
 * canonical frame's, so this is the identity; `"down"`'s input side (the
 * block's top edge) runs left-to-right while the canonical frame it maps
 * from runs the opposite way, so it alone needs flipping first.
 *
 * @param rotation - The gate's chosen rotation.
 * @param localH - The gate's local (pre-rotation) height — see
 *   {@link placementFor}.
 * @param along - The port's real position along its side, in px.
 * @returns The same position in the canonical frame.
 */
export function canonicalInputAlong(
  rotation: GateRotation,
  localH: number,
  along: number,
): number {
  return rotation === "down" ? localH - along : along;
}

/** Props for {@link GateSymbol}. */
interface GateSymbolProps {
  type: GateType;
  rotation: GateRotation;
  /** The block's true width/height in px — the symbol always fills these
   * exactly, regardless of rotation. */
  width: number;
  height: number;
  fill: string;
  stroke: string;
  /** Draws an inset selection ring around the body's own silhouette while
   * true, echoing every other kind's selection ring (see
   * .rtl-block.is-selected::after, app.css) — a gate can't reuse that
   * rectangular box-shadow directly, since it would draw around the block's
   * bounding box instead of the curved/D-shaped body inside it. */
  selected: boolean;
}

/**
 * The block-filling SVG glyph for a `"gate"` block: a real AND/OR/XOR outline
 * (with NAND/NOR/XNOR's negation bubble) rather than the plain rounded
 * rectangle every other kind uses, oriented per the block's own
 * {@link GateRotation}. Purely decorative — sized and colored from its
 * props, painted behind the block's real header/ports (RtlBlockNode.tsx),
 * and never itself the target of a click (`pointer-events: none`).
 *
 * @param props - See {@link GateSymbolProps}.
 * @returns An absolutely-positioned SVG filling the block.
 */
export default function GateSymbol({
  type,
  rotation,
  width,
  height,
  fill,
  stroke,
  selected,
}: GateSymbolProps) {
  const { localW, localH, transform } = placementFor(rotation, width, height);
  const { body, backLine, tipX, midY } = gateGeometry(type, localW, localH);
  // Fixed regardless of selection — the same real outline every other kind's
  // own base --block-outline (app.css) keeps unchanged at rest, so a gate's
  // resting edge never moves. The selection ring (below) is a separate
  // overlay instead of a thicker version of this stroke.
  const strokeWidth = 1.5;
  // React's useId() output contains colons (e.g. ":r3:") — harmless as a
  // plain `id` attribute, but colons inside a bare `url(#...)` token are
  // needless risk, so they're stripped rather than relied on to parse
  // correctly everywhere this ever renders (SVG export included).
  const clipId = `gate-clip-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className="gate-symbol"
      width={width}
      height={height}
      // XOR/XNOR's extra back line (see gateGeometry) is drawn a few px to
      // the left of x=0, on purpose — it reads as "just behind" the body's
      // own back edge, not flush against it. An SVG clips its own content to
      // its width/height by default, which would silently cut that sliver
      // off; visible overflow lets it draw those few px past the block's
      // own edge instead of disappearing.
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Restricts the selection ring below to the body's own interior —
       * without it, a stroke thick enough to read as a ring would spill half
       * its width outside the silhouette instead of insetting into it. */}
      <defs>
        <clipPath id={clipId}>
          <path d={body} />
          {isNegated(type) ? (
            <circle cx={tipX + BUBBLE_RADIUS} cy={midY} r={BUBBLE_RADIUS} />
          ) : null}
        </clipPath>
      </defs>
      <g transform={transform}>
        {backLine ? (
          <path
            d={backLine}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ) : null}
        <path d={body} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {isNegated(type) ? (
          <circle
            cx={tipX + BUBBLE_RADIUS}
            cy={midY}
            r={BUBBLE_RADIUS}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ) : null}
        {/* Traces the exact same silhouette again, on top, purely so
         * `.rtl-block:hover` (app.css) has a same-shaped target to lighten —
         * the block's own generic hover tint (.rtl-block::before) is a plain
         * inset rectangle, which would spill past a gate's curved/D-shaped
         * body instead of matching it. Opacity 0 at rest; app.css raises it
         * to match the non-gate hover tint's own 0.12. */}
        <g className="gate-symbol__hover-fill">
          <path d={body} fill="var(--block-hover-tint)" />
          {isNegated(type) ? (
            <circle cx={tipX + BUBBLE_RADIUS} cy={midY} r={BUBBLE_RADIUS} fill="var(--block-hover-tint)" />
          ) : null}
        </g>
        {/* The selection ring itself: the body's own outline stroked at
         * double the visible ring width, then clipped to the body's own
         * interior (the <clipPath> above) so only the inward half survives —
         * the same fixed-outer-edge, grows-inward look every other kind's
         * inset box-shadow ring already has (.rtl-block.is-selected::after,
         * app.css), rather than a plain thicker stroke, which would grow
         * both inward and outward and shift the gate's own visible edge. */}
        {selected ? (
          <g clipPath={`url(#${clipId})`}>
            <path
              d={body}
              fill="none"
              stroke={stroke}
              strokeWidth={SELECTION_RING_WIDTH * 2}
            />
            {isNegated(type) ? (
              <circle
                cx={tipX + BUBBLE_RADIUS}
                cy={midY}
                r={BUBBLE_RADIUS}
                fill="none"
                stroke={stroke}
                strokeWidth={SELECTION_RING_WIDTH * 2}
              />
            ) : null}
          </g>
        ) : null}
      </g>
    </svg>
  );
}
