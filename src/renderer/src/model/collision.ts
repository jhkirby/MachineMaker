/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Placement rules for dragging a block around the canvas: two blocks may never
// touch, and must keep a minimum clearance beyond that so a wire routed
// between their ports always has room to bend rather than clipping a body.

import type { RtlBlock } from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";

/** Minimum clearance between blocks, in grid cells, reserved for wire routing. */
export const MIN_BLOCK_GAP_CELLS = 2;

/** An axis-aligned box in canvas units. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether two rects overlap, edges-touching counting as no overlap.
 *
 * @param a - First rect.
 * @param b - Second rect.
 * @returns True if their interiors intersect.
 */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Grow a rect outward on every side by `cells` grid squares.
 *
 * @param rect - The rect to inflate.
 * @param cells - How many grid cells of padding to add per side.
 * @returns A new, larger rect centred the same as the original.
 */
function inflate(rect: Rect, cells: number): Rect {
  const pad = cells * GRID_SIZE;
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/**
 * Whether placing a block at `candidate` would overlap another block, or come
 * closer than {@link MIN_BLOCK_GAP_CELLS} grid cells to one.
 *
 * @param candidate - The rect the block would occupy.
 * @param blocks - Every block currently on the diagram.
 * @param excludeIds - Ids to skip when checking for obstacles — the block
 *   being placed, and (for a multi-select drag) every other block moving
 *   alongside it.
 * @returns True if the placement is too close to some other block.
 */
export function collidesWithOtherBlocks(
  candidate: Rect,
  blocks: readonly RtlBlock[],
  excludeIds: ReadonlySet<string>,
): boolean {
  return blocks.some(
    (block) =>
      !excludeIds.has(block.id) &&
      overlaps(candidate, inflate(block, MIN_BLOCK_GAP_CELLS)),
  );
}
