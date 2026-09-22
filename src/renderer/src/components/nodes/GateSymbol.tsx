/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-22
 * --------------------------------------------------------------------------- */

import type { GateRotation, GateType } from "../../../../shared/diagram-model";

/** Clear space, in px, kept between the block's own border and the symbol. */
const MARGIN = 4;

/** Radius, in px, of the small negation bubble NAND/NOR/XNOR draw at their
 * output tip. */
const BUBBLE_RADIUS = 4;

/** Which gate types draw a bubble at their output tip. */
function isNegated(type: GateType): boolean {
  return type === "NAND" || type === "NOR" || type === "XNOR";
}

/** Which gate types are in the OR family (curved body) rather than the AND
 * family (flat-left D shape). */
function isOrFamily(type: GateType): boolean {
  return type === "OR" || type === "NOR" || type === "XOR" || type === "XNOR";
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
    const backLine =
      type === "XOR" || type === "XNOR"
        ? `M ${x0 - 6} ${yTop} Q ${x0 - 6 + backBulge} ${midY} ${x0 - 6} ${yBot}`
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
function placementFor(
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
  /** Thicker stroke while selected, echoing every other kind's selection
   * ring (see .rtl-block.is-selected::after, app.css) — a gate draws that
   * emphasis on its own real outline instead, since a box-shadow ring makes
   * no sense against a non-rectangular shape. */
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
  const strokeWidth = selected ? 3 : 1.5;

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
      </g>
    </svg>
  );
}
