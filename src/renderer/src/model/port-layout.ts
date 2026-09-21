/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Rules that tie a block's size to its ports. Every port occupies its own
// interior grid point on its side, so a side with N ports needs at least N + 1
// cells (the +1 keeps the last port off the far corner). Adding a port past
// that limit grows the block.

import {
  isClockPort,
  isResetPort,
  portLabelText,
  type PortSide,
  type RtlBlock,
  type RtlPort,
} from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";
import { measurePortLabelWidth } from "./text-measure";

/** Smallest block, in grid cells, regardless of how few ports it has. */
export const MIN_BLOCK_CELLS = 3;

/**
 * Extra cells reserved for the header (name + kind label), on top of
 * whatever its left/right ports need — every block kind renders that header,
 * vertically centered, regardless of ports, and without this a block could
 * shrink so far that a port's own label sits on top of it.
 */
const HEADER_RESERVE_CELLS = 3;

/**
 * Minimum width, in cells, that leaves the header's title and kind label
 * room to read on one line rather than wrapping down into the port area —
 * independent of how many top/bottom ports a block has.
 */
const HEADER_MIN_WIDTH_CELLS = 5;

/** Minimum clear gap, in px, between two adjacent top/bottom port labels. */
const TOP_BOTTOM_LABEL_GAP_PX = 6;

/**
 * Extra interior cells a module's clk is held back from the far end of the
 * left edge, so its label doesn't collide with reset's — reset is pinned to
 * the *start* of the bottom edge, that same bottom-left corner. A single
 * cell only left a few px of gap once both labels' own line-height is
 * accounted for, thin enough to still read as touching — two cells gives a
 * clearly visible minimum margin between them instead.
 */
const CLK_BOTTOM_CLEARANCE_CELLS = 2;

/**
 * How many ports sit on one side of a block.
 *
 * @param block - The block to inspect.
 * @param side - The side to count.
 * @returns The number of ports currently on that side.
 */
function portsOnSide(block: RtlBlock, side: PortSide): number {
  return block.ports.filter((port) => port.side === side).length;
}

/**
 * Cells left/right ports must clear at the top so a low slot there doesn't
 * sit under a top-side port's label — only actually a risk when the block
 * has a top-side port to collide with; an empty top edge leaves left/right
 * free to start right at the first interior point instead of leaving a gap
 * nothing needs.
 *
 * @param block - The block to inspect.
 * @returns {@link HEADER_RESERVE_CELLS}, or 0 when the top edge is empty.
 */
function topClearanceCells(block: RtlBlock): number {
  return portsOnSide(block, "top") > 0 ? HEADER_RESERVE_CELLS : 0;
}

/**
 * The lowest interior grid slot a port may occupy on a side — see
 * {@link topClearanceCells} for why left/right holds back further than
 * top/bottom, which have no such neighbor at their own starting corner.
 *
 * @param block - The block the port sits on.
 * @param side - The side a port sits on.
 * @returns The lowest slot that side allows.
 */
function minSlotForSide(block: RtlBlock, side: PortSide): number {
  return side === "left" || side === "right" ? topClearanceCells(block) + 1 : 1;
}

/**
 * Whether a block kind pins its clk to the far (bottom) end of the left edge
 * — see {@link normalizeFixedPorts}. Modules and registers both do; the
 * other kinds have no clock port to pin in the first place.
 *
 * @param kind - The block kind to check.
 * @returns True if this kind pins clk.
 */
function pinsClk(kind: RtlBlock["kind"]): boolean {
  return kind === "module" || kind === "register";
}

/**
 * Extra height a block needs so its clk — pinned to the far end of the left
 * edge (see normalizeFixedPorts) — always lands with
 * {@link CLK_BOTTOM_CLEARANCE_CELLS} cells of clearance below it, even when
 * enough other left ports would otherwise pack it in right at the last
 * interior point. minBlockSize folds this in directly rather than leaving it
 * to pinToEdge's own placement, which only *tries* for that clearance and
 * silently loses the room to spare it whenever the generic per-port height
 * isn't already tall enough to have any left over.
 *
 * @param block - The block to inspect.
 * @returns The height, in cells, clk's clearance alone requires — 0 for any
 *   block that doesn't pin clk, or whose clk isn't (yet) left-pinned.
 */
function clkClearanceHeightCells(block: RtlBlock): number {
  if (!pinsClk(block.kind)) {
    return 0;
  }
  const clk = block.ports.find(isClockPort);
  if (!clk || clk.side !== "left") {
    return 0;
  }
  const otherLeftCount = portsOnSide(block, "left") - 1;
  const packedSlot = minSlotForSide(block, "left") + otherLeftCount;
  return packedSlot + 1 + CLK_BOTTOM_CLEARANCE_CELLS;
}

/**
 * Horizontal cells between adjacent port slots on one side of a block. A
 * top/bottom port's name label runs sideways off its dot (see portLayout in
 * RtlBlockNode), unlike a left/right port's label, which stacks label-per-row
 * and only needs the ordinary 1-cell pitch — so top/bottom ports get a wider
 * pitch, sized to the *widest* label actually on that side right now (every
 * port on a side shares one pitch, so they stay evenly spaced) so a rename or
 * a removal re-flows the rest rather than leaving stale spacing behind.
 *
 * @param block - The owning block.
 * @param side - Which side to measure.
 * @returns Cells per port slot on that side — always 1 for left/right.
 */
export function portPitchCells(block: RtlBlock, side: PortSide): number {
  if (side === "left" || side === "right") {
    return 1;
  }
  const widths = block.ports
    .filter((port) => port.side === side)
    .map((port) => measurePortLabelWidth(portLabelText(port)));
  const maxLabelWidth = widths.length > 0 ? Math.max(...widths) : 0;
  return Math.max(
    1,
    Math.ceil((maxLabelWidth + TOP_BOTTOM_LABEL_GAP_PX) / GRID_SIZE),
  );
}

/**
 * The smallest width/height (in pixels) that can seat the block's current
 * ports, with every edge still on a gridline, and leave its header (name +
 * kind label) legible and clear of any port.
 *
 * @param block - The block to size.
 * @returns Minimum width and height in canvas pixels.
 */
export function minBlockSize(block: RtlBlock): {
  width: number;
  height: number;
} {
  const topPitch = portPitchCells(block, "top");
  const bottomPitch = portPitchCells(block, "bottom");
  const widthCells = Math.max(
    MIN_BLOCK_CELLS,
    HEADER_MIN_WIDTH_CELLS,
    // The trailing term isn't the usual flat "+1": every port's label is
    // centered on its dot and sized to use up to half its own pitch cell on
    // each side (portPitchCells' whole point), but the *last* port on a side
    // has no further neighbor to share that pitch with — the block's own
    // edge has to supply that half-cell of room instead, or the label runs
    // past the border. (The first port needs no equivalent: it already sits
    // a full pitch in from the corner, more room than its own half needs.)
    portsOnSide(block, "top") * topPitch + Math.ceil(topPitch / 2),
    portsOnSide(block, "bottom") * bottomPitch + Math.ceil(bottomPitch / 2),
  );
  const heightCells = Math.max(
    MIN_BLOCK_CELLS,
    HEADER_RESERVE_CELLS + 1,
    // +1: left/right slots start just past topClearanceCells (see
    // minSlotForSide), so N ports there run up to slot
    // topClearanceCells + N, which itself needs one more cell of height to
    // stay off the far corner.
    topClearanceCells(block) + portsOnSide(block, "left") + 1,
    topClearanceCells(block) + portsOnSide(block, "right") + 1,
    clkClearanceHeightCells(block),
  );
  return { width: widthCells * GRID_SIZE, height: heightCells * GRID_SIZE };
}

/**
 * Grow a block in place so it is never smaller than {@link minBlockSize}.
 *
 * @param block - The block to adjust; mutated directly.
 */
export function growToFitPorts(block: RtlBlock): void {
  const min = minBlockSize(block);
  block.width = Math.max(block.width, min.width);
  block.height = Math.max(block.height, min.height);
}

/**
 * Re-fit a block to its (possibly changed) floor after an edit — a shorter
 * port name or a removed port can shrink {@link minBlockSize} as well as
 * grow it, and the block should shrink back too, but only along whichever
 * axis it was sitting exactly on its *old* floor: a block the user
 * deliberately resized larger stays exactly that size, growing further if
 * it must but never getting pulled in just because the ports needed less
 * room than before.
 *
 * @param block - The block to adjust; mutated directly.
 * @param priorMin - The block's {@link minBlockSize} from just before the
 *   edit that's now being reconciled, or undefined for a block that didn't
 *   exist yet (which only ever needs the plain grow-only clamp).
 */
export function resizeToFitPorts(
  block: RtlBlock,
  priorMin: { width: number; height: number } | undefined,
): void {
  const min = minBlockSize(block);
  block.width =
    priorMin && block.width === priorMin.width
      ? min.width
      : Math.max(block.width, min.width);
  block.height =
    priorMin && block.height === priorMin.height
      ? min.height
      : Math.max(block.height, min.height);
}

/**
 * The lowest interior grid slot on a side not already taken by another port,
 * starting from {@link minSlotForSide}.
 *
 * @param block - The owning block.
 * @param side - The side the new port will attach to.
 * @param excludePortId - A port to ignore when checking for collisions (used
 *   when moving an existing port to a new side).
 * @returns A 1-based slot index.
 */
export function nextFreeSlot(
  block: RtlBlock,
  side: PortSide,
  excludePortId?: string,
): number {
  const taken = new Set(
    block.ports
      .filter((port) => port.side === side && port.id !== excludePortId)
      .map((port) => port.slot),
  );
  let slot = minSlotForSide(block, side);
  while (taken.has(slot)) {
    slot += 1;
  }
  return slot;
}

/**
 * Re-slot every port on one side of a block so `pinned` sits first or last,
 * preserving the relative order of the others (which shift over by one to
 * make room, rather than being renumbered arbitrarily). "Last" means the
 * far interior grid point on that side — i.e. against the block's actual
 * far edge, not merely after whatever other ports happen to share the side —
 * so the pinned port stays visually anchored to the corner even when the
 * block is much bigger than its port count requires.
 *
 * @param block - The owning block, for its current width/height in cells.
 * @param ports - All of the block's ports; mutated in place.
 * @param side - Which side to re-slot.
 * @param pinned - The port to pin to one end of that side.
 * @param position - Which end to pin it to.
 * @param cornerClearance - Extra interior cells to hold back from the far
 *   corner on a "last" pin, so its label doesn't collide with another port's
 *   label pinned to the start of the adjoining side at that same corner.
 */
function pinToEdge(
  block: RtlBlock,
  ports: RtlPort[],
  side: PortSide,
  pinned: RtlPort,
  position: "first" | "last",
  cornerClearance = 0,
): void {
  const minSlot = minSlotForSide(block, side);
  const others = ports
    .filter((port) => port.side === side && port.id !== pinned.id)
    .sort((a, b) => a.slot - b.slot);
  if (position === "first") {
    pinned.slot = minSlot;
    others.forEach((port, index) => {
      port.slot = minSlot + index + 1;
    });
  } else {
    others.forEach((port, index) => {
      port.slot = minSlot + index;
    });
    const sideCells =
      (side === "left" || side === "right" ? block.height : block.width) /
      GRID_SIZE;
    pinned.slot = Math.max(
      minSlot + others.length,
      sideCells - 1 - cornerClearance,
    );
  }
}

/**
 * Pin a block's clock and reset to their fixed structural positions — clk
 * last (bottom-most) on the left edge (modules and registers both have a
 * clk to pin; see {@link pinsClk}), reset first (leftmost) on the bottom
 * edge (modules only — no other kind has a reset) — so neither can end up
 * somewhere else relative to a block's other ports, no matter what else
 * about the block just changed. Also forces both back to a plain 1-bit input
 * — the only shape either one is ever allowed to have — since that's a data
 * invariant this function is the sole enforcement point for, the same as
 * side: the inspector merely hides the controls that would otherwise let you
 * break it. A no-op for a port the block doesn't have, or a kind that pins
 * neither.
 *
 * @param block - The block to pin ports on; mutated in place.
 */
export function normalizeFixedPorts(block: RtlBlock): void {
  const clk = pinsClk(block.kind) ? block.ports.find(isClockPort) : undefined;
  const reset =
    block.kind === "module" ? block.ports.find(isResetPort) : undefined;
  if (!clk && !reset) {
    return;
  }
  if (clk) {
    clk.side = "left";
    clk.direction = "in";
    clk.width = undefined;
  }
  if (reset) {
    reset.side = "bottom";
    reset.direction = "in";
    reset.width = undefined;
  }
  if (clk) {
    // Held back from the bottom-left corner (see clkClearanceHeightCells,
    // which guarantees minBlockSize actually leaves room for it) so its
    // label doesn't overlap "reset", which is pinned to the start of the
    // bottom edge at that same corner.
    pinToEdge(block, block.ports, "left", clk, "last", CLK_BOTTOM_CLEARANCE_CELLS);
  }
  if (reset) {
    pinToEdge(block, block.ports, "bottom", reset, "first");
  }
  growToFitPorts(block);
}

/**
 * The lowest slot {@link centerPortGroups} may place a side's regular ports
 * at — {@link minSlotForSide}'s usual floor, except on a module's bottom edge
 * where reset already occupies that floor, so the group starts one slot past
 * it instead of on top of it. In slot units throughout, same as `.slot`
 * itself (a plain per-port ordinal — see portPitchCells for how that then
 * maps to an actual pixel/cell position at render time).
 *
 * @param block - The owning block.
 * @param side - The side to bound.
 * @returns The lowest usable slot.
 */
function minSlotBoundForSide(block: RtlBlock, side: PortSide): number {
  if (side === "bottom" && block.kind === "module") {
    const reset = block.ports.find(isResetPort);
    if (reset && reset.side === "bottom") {
      return reset.slot + 1;
    }
  }
  return minSlotForSide(block, side);
}

/**
 * The highest slot {@link centerPortGroups} may place a side's regular ports
 * at — the last interior point, except on a clk-pinning block's left edge
 * (see {@link pinsClk}) where clk already occupies the far end, so the group
 * stops one slot short of it instead of on top of it. In slot units (see
 * {@link minSlotBoundForSide}): the interior point itself is a *cell* count,
 * so it's divided down by the side's own pitch to land back in slot units —
 * skipping that conversion would let a wide top/bottom pitch push the last
 * slot's rendered position (slot × pitch) well past the block's actual edge.
 *
 * @param block - The owning block.
 * @param side - The side to bound.
 * @returns The highest usable slot.
 */
function maxSlotBoundForSide(block: RtlBlock, side: PortSide): number {
  const cells =
    (side === "left" || side === "right" ? block.height : block.width) /
    GRID_SIZE;
  if (side === "left" && pinsClk(block.kind)) {
    const clk = block.ports.find(isClockPort);
    if (clk && clk.side === "left") {
      return clk.slot - 1;
    }
  }
  return Math.floor((cells - 1) / portPitchCells(block, side));
}

/**
 * Center each side's regular (non-pinned) ports within the room actually
 * available to them, rather than leaving them packed against whichever end
 * nextFreeSlot happened to start counting from — which is how they arrive by
 * default, and reads as lopsided whenever the block ends up taller or wider
 * than that one side alone needs (e.g. a module stretched by clk's own
 * clearance). A module's clk/reset are untouched here; they stay exactly
 * where normalizeFixedPorts pinned them, and only bound the range this
 * centers the *other* ports within (see minSlotBoundForSide /
 * maxSlotBoundForSide).
 *
 * @param block - The block to re-slot; mutated in place.
 */
export function centerPortGroups(block: RtlBlock): void {
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const regular = block.ports
      .filter(
        (port) =>
          port.side === side && !isClockPort(port) && !isResetPort(port),
      )
      .sort((a, b) => a.slot - b.slot);
    if (regular.length === 0) {
      continue;
    }
    const minBound = minSlotBoundForSide(block, side);
    const maxBound = maxSlotBoundForSide(block, side);
    // Plain slot-count span — .slot is an ordinal (pitch is applied only at
    // render time), so this must not be scaled by pitch either.
    const occupiedSlots = regular.length - 1;
    const start =
      minBound + Math.max(0, Math.floor((maxBound - minBound - occupiedSlots) / 2));
    regular.forEach((port, index) => {
      port.slot = start + index;
    });
  }
}
