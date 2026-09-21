/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Plain, serializable description of an RTL block diagram. Shared between the
// Electron main process (file I/O) and the renderer (editing / rendering) so
// both sides agree on the on-disk shape.

/** Which edge of a block a port sits on. */
export type PortSide = "left" | "right" | "top" | "bottom";

/** Signal direction of a port relative to its owning block. */
export type PortDirection = "in" | "out";

/** Visual/semantic family of a block. Drives styling and default port layout. */
export type BlockKind = "module" | "register" | "io" | "constant";

/** File format version, bumped when {@link RtlDiagram} changes incompatibly. */
export const DIAGRAM_SCHEMA_VERSION = 3 as const;

/** Smallest and largest bit width a port bus may declare. */
export const MIN_BUS_WIDTH = 1;
export const MAX_BUS_WIDTH = 1024;

/** A single connection point on a block. */
export interface RtlPort {
  /** Stable id, unique within the owning block. */
  id: string;
  /** Human-readable name shown next to the port (e.g. "clk", "d", "q"). */
  name: string;
  side: PortSide;
  direction: PortDirection;
  /**
   * 1-based grid-cell index along the port's side, measured from the side's
   * starting corner (top for left/right, left for top/bottom). Always an
   * interior point — never 0 or the far corner — so the handle lands exactly on
   * a grid intersection and never on a corner.
   */
  slot: number;
  /**
   * Bus width in bits, 1..1024. Omitted or 1 means a plain 1-bit wire with no
   * width annotation; anything larger renders as `[width-1:0]`.
   */
  width?: number;
}

/**
 * Render a bus width as the Verilog-style range label shown on ports and wires.
 *
 * @param width - Bit width, or undefined for a 1-bit wire.
 * @returns e.g. `"[31:0]"` for 32, or `""` when there is nothing to annotate.
 */
export function formatBusWidth(width: number | undefined): string {
  return width && width > 1 ? `[${width - 1}:0]` : "";
}

/**
 * Full text a port's label renders as: its name, plus the bus width range
 * when it has one. Shared by every renderer of a port label (the canvas
 * node, the SVG export, and the text-width measurement that sizes a block
 * to fit its top/bottom labels) so they never drift out of sync.
 *
 * @param port - The port to label.
 * @returns e.g. `"in [31:0]"`, or just `"clk"` for a 1-bit port.
 */
export function portLabelText(port: RtlPort): string {
  const range = formatBusWidth(port.width);
  return range ? `${port.name} ${range}` : port.name;
}

/**
 * Whether a port is the block's clock, by the conventional exact name "clk".
 * Drawn as an edge-triggered clock triangle instead of a plain port (see
 * RtlBlockNode), and what a module's combinational/sequential toggle checks
 * for and manages (see `setModuleSequential` in the diagram store).
 *
 * @param port - The port to test.
 * @returns True if the port is named exactly "clk".
 */
export function isClockPort(port: RtlPort): boolean {
  return port.name === "clk";
}

/**
 * Whether a port is an active-low reset, by its name containing "reset" or
 * "rst" (case-insensitive) — e.g. "rst_n", "reset", "sys_reset_n". Drawn with
 * an inversion bubble outside the block (see RtlBlockNode), and what a
 * module's combinational/sequential toggle checks for and manages.
 *
 * @param port - The port to test.
 * @returns True if the port's name matches the reset naming convention.
 */
export function isResetPort(port: RtlPort): boolean {
  return /reset|rst/i.test(port.name);
}

/** A block on the canvas. */
export interface RtlBlock {
  id: string;
  kind: BlockKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: RtlPort[];
}

/** A wire between two ports. */
export interface RtlWire {
  id: string;
  sourceBlockId: string;
  sourcePortId: string;
  targetBlockId: string;
  targetPortId: string;
  /** Optional label rendered at the wire midpoint, e.g. a bus width. */
  label?: string;
}

/** The complete diagram document. */
export interface RtlDiagram {
  schemaVersion: typeof DIAGRAM_SCHEMA_VERSION;
  /** Title shown in the window and used as the default export name. */
  title: string;
  blocks: RtlBlock[];
  wires: RtlWire[];
}

/**
 * Build an empty diagram document.
 *
 * @param title - Title for the new document.
 * @returns A diagram with no blocks or wires.
 */
export function createEmptyDiagram(title = "Untitled Diagram"): RtlDiagram {
  return { schemaVersion: DIAGRAM_SCHEMA_VERSION, title, blocks: [], wires: [] };
}
