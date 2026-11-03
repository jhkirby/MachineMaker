/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Plain, serializable description of an RTL block diagram. Shared between the
// Electron main process (file I/O) and the renderer (editing / rendering) so
// both sides agree on the on-disk shape.

/** Which edge of a block a port sits on. */
export type PortSide = "left" | "right" | "top" | "bottom";

/**
 * Signal direction of a port relative to its owning block. `"inout"` is
 * bidirectional and, unlike `"in"`/`"out"`, can only wire to another
 * `"inout"` port — see {@link resolvePortPairConnection} in
 * model/flow-adapters.ts, the single place that rule is enforced.
 */
export type PortDirection = "in" | "out" | "inout";

/** Visual/semantic family of a block. Drives styling and default port layout. */
export type BlockKind =
  | "module"
  | "register"
  | "io"
  | "constant"
  | "gate"
  | "codec"
  | "mux";

/**
 * Which way a `"codec"` block translates — chosen from the Type toggle in
 * the inspector (InspectorPanel.tsx). A decoder turns {@link RtlBlock.bits}
 * inputs into 2^bits one-hot outputs; an encoder is the reverse. Meaningless
 * on any other kind.
 */
export type CodecType = "encoder" | "decoder";

/**
 * What an `"io"` block's pin is for — chosen from the Type toggle in the
 * inspector. Omitted means a standard signal. A clock or reset pin is
 * always a 1-bit input (see normalizeFixedPorts), isn't driven by hand while
 * simulating (the Clock and Reset buttons stand in for it), and is never
 * part of a linked module's interface — the parent module's own clk/reset
 * feed it instead.
 */
export type IoRole = "clock" | "reset";

/**
 * Smallest and largest {@link RtlBlock.bits} a codec or multiplexer may
 * declare. The ceiling keeps the widest of them (a 4-to-16 decoder, or a
 * 16:1 mux with 4 selects and 1 output) comfortably under {@link MAX_PORTS}.
 */
export const MIN_STRUCTURED_BITS = 1;
export const MAX_STRUCTURED_BITS = 4;

/**
 * Which boolean function a `"gate"` block computes — chosen from the button
 * group above its Ports section (InspectorPanel.tsx). Meaningless on any
 * other kind.
 */
export type GateType = "AND" | "NAND" | "OR" | "NOR" | "XOR" | "XNOR";

/**
 * Which way a `"gate"` block's symbol (and its output) points — chosen from
 * the "Rotation" button group under Gate Type (InspectorPanel.tsx).
 * `"right"` is the default a fresh gate is created with: inputs on the left,
 * output on the right. Drives both the drawn symbol's orientation
 * (RtlBlockNode.tsx's GateSymbol) and which side every port is pinned to
 * (normalizeFixedPorts in model/port-layout.ts) — meaningless on any other
 * kind.
 */
export type GateRotation = "up" | "down" | "left" | "right";

/** File format version, bumped when {@link RtlDiagram} changes incompatibly. */
export const DIAGRAM_SCHEMA_VERSION = 3 as const;

/** Smallest and largest bit width a port bus may declare. */
export const MIN_BUS_WIDTH = 1;
export const MAX_BUS_WIDTH = 1024;

/**
 * Largest number of a diagram author's *own* ports a single block may carry
 * — see {@link countedPorts} for what that excludes. Past this, a
 * hand-authored schematic stops being something a diagram author can read
 * at a glance — the whole point of this tool over a plain netlist — so
 * it's a hard ceiling rather than just a soft warning.
 */
export const MAX_PORTS = 30;

/**
 * Largest number of input ports a `"gate"` block may carry — its one output
 * is fixed and doesn't count toward this (see {@link RtlBlock.kind}'s doc on
 * "gate", and normalizeFixedPorts in model/port-layout.ts, which enforces
 * that every non-output port on a gate is an input). A gate reading many
 * more inputs than this stops being something a diagram author can take in
 * as one gate at a glance, the same reasoning as {@link MAX_PORTS}, just a
 * tighter number for a kind that's normally 2-3 inputs.
 */
export const GATE_MAX_INPUTS = 16;

/**
 * Fewest input ports a `"gate"` block may ever be left with — a gate with
 * zero or one input isn't really a boolean function of anything any more.
 * Enforced both in the store (removePort refuses to go below this) and in
 * the inspector, where an input at the floor simply has no remove button
 * (canRemovePort in InspectorPanel.tsx) rather than a disabled one.
 */
export const GATE_MIN_INPUTS = 2;

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
  /**
   * What a port is for, when its direction alone doesn't say — only set on
   * a `"mux"` block's select lines (`"select"`), which share the `"in"`
   * direction with its data inputs. Omitted everywhere else.
   */
  role?: "select";
  /**
   * Deliberately left unconnected — "tied off" — so a diagram can be
   * complete without wiring every port. Drawn with an X through the port,
   * and a tied-off port can't take a wire. Only ever set where
   * {@link canTieOff} allows; omitted otherwise.
   */
  tiedOff?: true;
  /**
   * On a linked module's port: the id of the I/O component in the linked
   * schematic this port mirrors (see shared/module-interface.ts). It's how a
   * port keeps its wires when that I/O component is renamed. Omitted on
   * every other port.
   */
  sourceId?: string;
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

/**
 * Whether a port may be tied off (see {@link RtlPort.tiedOff}). An I/O pin
 * or constant exists only to be wired, so neither offers it, and a clock
 * or reset is structural, never optional, so neither of those does either.
 *
 * @param kind - The owning block's kind.
 * @param port - The port.
 * @returns True if the port can be tied off.
 */
export function canTieOff(kind: BlockKind, port: RtlPort): boolean {
  return (
    kind !== "io" &&
    kind !== "constant" &&
    !isClockPort(port) &&
    !isResetPort(port)
  );
}

/**
 * How many of a block's ports count toward {@link MAX_PORTS} — every one
 * except clk and reset, which are structural (a sequential block always
 * has exactly one of each, never optional — see normalizeFixedPorts in
 * model/port-layout.ts) rather than part of a diagram author's own port
 * budget. A block sitting at the cap can still never lose its clk/reset to
 * it.
 *
 * @param ports - The block's full port list.
 * @returns The count of ports other than clk/reset.
 */
export function countedPorts(ports: readonly RtlPort[]): number {
  return ports.filter((port) => !isClockPort(port) && !isResetPort(port))
    .length;
}

/**
 * Human-readable tally of a block's own ports by direction, e.g.
 * `"3 in, 2 out, 1 inout"` — skips clk/reset (see {@link countedPorts}, which
 * this tally always sums back to) and omits a direction entirely once it has
 * none, rather than printing "0 out". Rendered under the "+ Port" button in
 * the inspector (InspectorPanel.tsx).
 *
 * @param ports - The block's full port list.
 * @returns e.g. `"3 in, 2 out, 1 inout"`, or `""` when the block has no
 *   counted ports.
 */
export function portDirectionSummary(ports: readonly RtlPort[]): string {
  const counted = ports.filter(
    (port) => !isClockPort(port) && !isResetPort(port),
  );
  const countOf = (direction: PortDirection): number =>
    counted.filter((port) => port.direction === direction).length;
  return (["in", "out", "inout"] as const)
    .map((direction) => {
      const count = countOf(direction);
      return count > 0 ? `${count} ${direction}` : null;
    })
    .filter((part): part is string => part !== null)
    .join(", ");
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
  /**
   * Custom accent color (`#rrggbb`), replacing the kind's default palette
   * (see resolvePalette in model/block-appearance.ts). Omitted means the
   * block still uses its kind's default color.
   */
  color?: string;
  /**
   * Which boolean function this block computes — only meaningful when
   * `kind` is `"gate"`, where it's always set (see createBlock in
   * model/component-library.ts). Omitted on every other kind.
   */
  gateType?: GateType;
  /**
   * Which way this block's symbol points — only meaningful when `kind` is
   * `"gate"`, where it's always set (see createBlock in
   * model/component-library.ts). Omitted on every other kind.
   */
  gateRotation?: GateRotation;
  /**
   * Encoder or decoder — only meaningful when `kind` is `"codec"`, where
   * it's always set (see createBlock in model/component-library.ts).
   */
  codecType?: CodecType;
  /**
   * The inspector's "Size" — only meaningful on `"codec"` and `"mux"`,
   * where it's always set. For a decoder it's the input count (3 → a
   * 3-to-8 decoder), for an encoder the output count (3 → 8-to-3), and for
   * a mux the select-line count (3 → 8 data inputs). The ports themselves
   * follow from it — see model/structured-ports.ts.
   */
  bits?: number;
  /**
   * Clock or reset, for an `"io"` block whose pin is one (see
   * {@link IoRole}). Omitted on a standard I/O pin and every other kind.
   */
  ioRole?: IoRole;
  /**
   * Bus width of a `"mux"` block's data inputs and output (its selects
   * stay 1 bit). Always set on a mux; omitted on every other kind.
   */
  dataWidth?: number;
  /**
   * The schematic this block stands for — only meaningful when `kind` is
   * `"module"`. Omitted (or without a `path`) means the block is unlinked:
   * a free-standing box nothing describes the inside of yet. Set from the
   * inspector's Link section (ModuleLinkSection.tsx).
   */
  linkedModule?: ModuleDefinition;
}

/** One port of a {@link ModuleDefinition}: its interface, minus layout. */
export interface ModulePortDefinition {
  name: string;
  direction: PortDirection;
  /** Bus width in bits; omitted or 1 means a 1-bit wire, as on RtlPort. */
  width?: number;
  /** Id of the linked schematic's I/O component this port comes from. */
  sourceId?: string;
}

/**
 * A module's interface — the linked schematic's title and the ports its I/O
 * components define — as it stood when the module was last brought in line
 * with it. What a module block links to; see {@link RtlBlock.linkedModule}.
 */
export interface ModuleDefinition {
  /** The linked schematic's title. */
  name: string;
  /**
   * The linked schematic's file, relative to the project folder with "/"
   * separators (e.g. "schematics/ALU.rtlproj"), so the project can move
   * without breaking it. Absent on a definition from before linking to
   * schematics existed, which counts as unlinked.
   */
  path?: string;
  ports: ModulePortDefinition[];
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
export function createEmptyDiagram(title = "Untitled Schematic"): RtlDiagram {
  return { schemaVersion: DIAGRAM_SCHEMA_VERSION, title, blocks: [], wires: [] };
}
