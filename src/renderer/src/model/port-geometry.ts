/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Geometry helpers shared by the SVG exporter and any code that needs to know
// where a port physically sits. No React — but portPosition leans on
// port-layout's measured top/bottom pitch (canvas text metrics), so unlike
// the rest of this file it does need a live DOM to be exact; without one it
// falls back to a per-character width estimate (see text-measure.ts).

import type { PortSide, RtlBlock, RtlPort } from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";
import { portPitchCells } from "./port-layout";

/** A point in canvas coordinates. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Absolute canvas position of a port on its block. The port sits `slot`
 * pitch-steps in from its side's starting corner — one grid cell per step on
 * left/right, {@link portPitchCells}'s wider (measured) step on top/bottom
 * (see portLayout in RtlBlockNode, which this mirrors so the wire drawn here
 * always meets the dot actually rendered there).
 *
 * @param block - The block that owns the port.
 * @param port - The port to locate.
 * @returns The port's anchor point in canvas coordinates.
 */
export function portPosition(block: RtlBlock, port: RtlPort): Point {
  const along = port.slot * portPitchCells(block, port.side) * GRID_SIZE;
  switch (port.side) {
    case "left":
      return { x: block.x, y: block.y + along };
    case "right":
      return { x: block.x + block.width, y: block.y + along };
    case "top":
      return { x: block.x + along, y: block.y };
    case "bottom":
      return { x: block.x + along, y: block.y + block.height };
    default:
      return { x: block.x, y: block.y };
  }
}

/**
 * Unit vector pointing away from the block at the given side.
 *
 * @param side - The side the port sits on.
 * @returns The outward normal direction.
 */
export function outwardNormal(side: PortSide): Point {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    default:
      return { x: 1, y: 0 };
  }
}

/**
 * Build a smooth cubic-bezier path between two ports, leaving each port along
 * its outward normal so wires exit blocks cleanly.
 *
 * @param source - Anchor point of the source port.
 * @param sourceSide - Side the source port sits on.
 * @param target - Anchor point of the target port.
 * @param targetSide - Side the target port sits on.
 * @returns An SVG path `d` string.
 */
export function wirePath(
  source: Point,
  sourceSide: PortSide,
  target: Point,
  targetSide: PortSide,
): string {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const reach = Math.max(40, distance * 0.4);
  const sn = outwardNormal(sourceSide);
  const tn = outwardNormal(targetSide);
  const c1 = { x: source.x + sn.x * reach, y: source.y + sn.y * reach };
  const c2 = { x: target.x + tn.x * reach, y: target.y + tn.y * reach };
  return (
    `M ${source.x} ${source.y} ` +
    `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`
  );
}

/**
 * Midpoint between two points, used to place a wire label.
 *
 * @param a - First point.
 * @param b - Second point.
 * @returns The point halfway between a and b.
 */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
