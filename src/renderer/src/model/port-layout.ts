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
  type GateRotation,
  type PortSide,
  type RtlBlock,
  type RtlPort,
} from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";
import { measurePortLabelWidth } from "./text-measure";

/** Smallest block, in grid cells, regardless of how few ports it has. */
export const MIN_BLOCK_CELLS = 3;

/**
 * Smallest a module or register may ever be, in grid cells, regardless of
 * how few ports it currently has — both kinds always carry at least a clk
 * (and, per {@link pinsReset}, a reset too), so shrinking to the generic
 * {@link MIN_BLOCK_CELLS} floor would already crowd those two labels; this
 * is simply the component library's own default size (see
 * COMPONENT_LIBRARY in component-library.ts) promoted to a hard floor
 * neither kind can be resized below.
 */
const MODULE_REGISTER_MIN_WIDTH_CELLS = 10;
const MODULE_REGISTER_MIN_HEIGHT_CELLS = 8;

/**
 * Smallest an I/O port or constant may ever be, in grid cells — the same
 * idea as {@link MODULE_REGISTER_MIN_WIDTH_CELLS}/
 * {@link MODULE_REGISTER_MIN_HEIGHT_CELLS} but for the two single-port kinds,
 * which would otherwise float down toward the generic {@link MIN_BLOCK_CELLS}
 * floor and read as cramped next to a module or register on the same canvas.
 */
const IO_CONSTANT_MIN_WIDTH_CELLS = 10;
const IO_CONSTANT_MIN_HEIGHT_CELLS = 4;

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
 * Whether a block kind pins its reset to the start (bottom-left) of the
 * bottom edge — see {@link normalizeFixedPorts}. The same two kinds as
 * {@link pinsClk}: a register is inherently edge-triggered, so — like a
 * sequential module — it always carries a reset, never an optional one.
 *
 * @param kind - The block kind to check.
 * @returns True if this kind pins reset.
 */
function pinsReset(kind: RtlBlock["kind"]): boolean {
  return kind === "module" || kind === "register";
}

/**
 * How far clk must be held back from the exact bottom-left corner: whenever
 * a block also pins a reset to the *start* of the bottom edge — that same
 * corner — it needs {@link CLK_BOTTOM_CLEARANCE_CELLS} to keep the two
 * labels apart. A block with no reset has nothing to collide with, so its
 * clk pins to the true last slot instead of losing cells to a collision that
 * can't happen.
 *
 * @param block - The block to inspect.
 * @returns The clearance, in cells, to hold clk back by.
 */
function clkCornerClearanceCells(block: RtlBlock): number {
  return block.ports.some(isResetPort) ? CLK_BOTTOM_CLEARANCE_CELLS : 0;
}

/**
 * Extra height a block needs so its clk — pinned to the far end of the left
 * edge (see normalizeFixedPorts) — always lands with
 * {@link clkCornerClearanceCells} cells of clearance below it, even when
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
  return packedSlot + 1 + clkCornerClearanceCells(block);
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
  // Modules and registers (pinsClk's own two kinds) never shrink below their
  // library default, on top of whatever their current ports demand — and
  // I/O ports/constants have their own, smaller floor for the same reason.
  const fixedMinCells = pinsClk(block.kind);
  const isIoOrConstant = block.kind === "io" || block.kind === "constant";
  const widthCells = Math.max(
    MIN_BLOCK_CELLS,
    HEADER_MIN_WIDTH_CELLS,
    fixedMinCells ? MODULE_REGISTER_MIN_WIDTH_CELLS : 0,
    isIoOrConstant ? IO_CONSTANT_MIN_WIDTH_CELLS : 0,
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
    fixedMinCells ? MODULE_REGISTER_MIN_HEIGHT_CELLS : 0,
    isIoOrConstant ? IO_CONSTANT_MIN_HEIGHT_CELLS : 0,
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
 * last (bottom-most) on the left edge, reset first (leftmost) on the bottom
 * edge — so neither can end up somewhere else relative to a block's other
 * ports, no matter what else about the block just changed. Modules and
 * registers both pin both (see {@link pinsClk} / {@link pinsReset}); no
 * other kind has either. Also forces both back to a plain 1-bit input — the
 * only shape either one is ever allowed to have — since that's a data
 * invariant this function is the sole enforcement point for, the same as
 * side: the inspector merely hides the controls that would otherwise let you
 * break it. A no-op for a port the block doesn't have, or a kind that pins
 * neither.
 *
 * @param block - The block to pin ports on; mutated in place.
 */
/**
 * Which side a gate's inputs and output sit on for a given rotation — the
 * default `"right"` matches this app's original fixed layout (inputs left,
 * output right); the other three rotate that 90°/180° at a time. Read by
 * {@link normalizeFixedPorts} to pin every gate port's side, and by
 * GateSymbol (RtlBlockNode.tsx) to orient the drawn symbol the same way, so
 * the two can never drift out of sync with each other.
 *
 * @param rotation - The gate's chosen rotation.
 * @returns Which side the inputs, and which side the output, sit on.
 */
export function gateSidesFor(
  rotation: GateRotation,
): { input: PortSide; output: PortSide } {
  switch (rotation) {
    case "left":
      return { input: "right", output: "left" };
    case "up":
      return { input: "bottom", output: "top" };
    case "down":
      return { input: "top", output: "bottom" };
    case "right":
    default:
      return { input: "left", output: "right" };
  }
}

export function normalizeFixedPorts(block: RtlBlock): void {
  // An I/O port's or constant's single port is left/right only — see
  // availableSides in InspectorPanel.tsx, which is what stops a diagram
  // author from ever choosing top/bottom in the first place. This is the
  // backstop for a side that arrived some other way (a loaded file authored
  // before this rule, or the schema's own type not actually restricting the
  // JSON on disk) — centerPortGroups (run right after this in the same
  // commit) then re-slots it correctly for whichever side it lands on.
  if (block.kind === "io" || block.kind === "constant") {
    const port = block.ports[0];
    if (port && port.side !== "left" && port.side !== "right") {
      port.side = "right";
    }
  }
  // A gate has exactly one output and any number of inputs, and — unlike a
  // module, where direction is a free choice per port — that shape is a data
  // invariant this function is the sole enforcement point for, the same as
  // clk/reset's direction/width below: the inspector merely hides the Drive
  // dropdown for a gate's ports rather than being what actually holds the
  // line. Whichever port already reads "out" stays the output; a block that
  // somehow has none (freshly loaded from a hand-edited file, say) falls
  // back to its first port rather than leaving every port "in".
  if (block.kind === "gate") {
    const output =
      block.ports.find((port) => port.direction === "out") ?? block.ports[0];
    const sides = gateSidesFor(block.gateRotation ?? "right");
    block.ports.forEach((port) => {
      port.direction = port === output ? "out" : "in";
      // A gate's ports are always plain 1-bit signals — see the Ports table
      // in InspectorPanel.tsx, which doesn't even offer a Width column for
      // this kind.
      port.width = undefined;
      // Which side is fixed by the Rotation control (InspectorPanel.tsx)
      // rather than freely chosen per port — a gate's drawn symbol (see
      // GateSymbol, RtlBlockNode.tsx) has one input face and one output
      // face, so an individually-repositioned port wouldn't have anywhere
      // on the actual shape to attach to any more.
      port.side = port === output ? sides.output : sides.input;
    });
  }
  const clk = pinsClk(block.kind) ? block.ports.find(isClockPort) : undefined;
  const reset = pinsReset(block.kind)
    ? block.ports.find(isResetPort)
    : undefined;
  if (clk || reset) {
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
      // Held back from the bottom-left corner only when this block also pins
      // a reset there (see clkCornerClearanceCells) — otherwise clk pins to
      // the true bottom-left corner, with no reset label for it to avoid.
      pinToEdge(
        block,
        block.ports,
        "left",
        clk,
        "last",
        clkCornerClearanceCells(block),
      );
    }
    if (reset) {
      pinToEdge(block, block.ports, "bottom", reset, "first");
    }
    growToFitPorts(block);
  }
  sortPorts(block, clk, reset);
}

/** Sort rank for {@link sortPorts}: "in" first, then "out", then "inout". */
function directionRank(direction: RtlPort["direction"]): number {
  return direction === "in" ? 0 : direction === "out" ? 1 : 2;
}

/**
 * Reorder a block's ports (the array itself, not just how any one view of it
 * happens to render them) to the app's one canonical order: clk then reset
 * first, on whichever kind pins them (see {@link pinsClk}/{@link pinsReset}),
 * then every other port grouped by direction — in, then out, then inout —
 * with each port's position *within* its group left exactly where it was.
 * Every list of a block's ports (the inspector's Ports table, chiefly) reads
 * `block.ports` directly in array order rather than sorting it again itself,
 * so this is the one place that order is actually decided.
 *
 * @param block - The block to reorder; `ports` replaced in place.
 * @param clk - This block's clock port, if {@link pinsClk} found one.
 * @param reset - This block's reset port, if {@link pinsReset} found one.
 */
function sortPorts(
  block: RtlBlock,
  clk: RtlPort | undefined,
  reset: RtlPort | undefined,
): void {
  const rest = block.ports.filter((port) => port !== clk && port !== reset);
  // Array.prototype.sort has been a stable sort (equal-rank ports keep their
  // relative order) since ES2019 — every engine this app ships on qualifies.
  rest.sort((a, b) => directionRank(a.direction) - directionRank(b.direction));
  block.ports = [
    ...(clk ? [clk] : []),
    ...(reset ? [reset] : []),
    ...rest,
  ];
}

/**
 * The lowest slot {@link centerPortGroups} may place a side's regular ports
 * at — {@link minSlotForSide}'s usual floor, except on a reset-pinning
 * block's bottom edge (see {@link pinsReset}) where reset already occupies
 * that floor, so the group starts one slot past it instead of on top of it.
 * In slot units throughout, same as `.slot` itself (a plain per-port ordinal
 * — see portPitchCells for how that then maps to an actual pixel/cell
 * position at render time).
 *
 * @param block - The owning block.
 * @param side - The side to bound.
 * @returns The lowest usable slot.
 */
function minSlotBoundForSide(block: RtlBlock, side: PortSide): number {
  if (side === "bottom" && pinsReset(block.kind)) {
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
