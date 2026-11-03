/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Schematic-as-code: a hand-writable JSON/YAML description of a diagram, and
// the conversions between it and the editor's own RtlDiagram. The format
// names things (components by name, ports by "component.port") instead of
// using ids, leaves layout optional, and has short forms for the common
// cases — see SCHEMATIC_EXAMPLE_YAML below for a tour of every feature.

import { nanoid } from "nanoid";
import { Document, isScalar, isSeq, parse as parseYaml, visit } from "yaml";
import {
  DIAGRAM_SCHEMA_VERSION,
  GATE_MAX_INPUTS,
  GATE_MIN_INPUTS,
  MAX_BUS_WIDTH,
  MAX_STRUCTURED_BITS,
  MIN_BUS_WIDTH,
  MIN_STRUCTURED_BITS,
  canTieOff,
  formatBusWidth,
  isClockPort,
  isResetPort,
  type GateRotation,
  type GateType,
  type PortDirection,
  type PortSide,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";
import { isValidHexColor } from "./block-appearance";
import { createBlock } from "./component-library";
import { directionsCompatible } from "./flow-adapters";
import { GRID_SIZE } from "./grid";
import {
  centerPortGroups,
  growToFitPorts,
  nextFreeSlot,
  normalizeFixedPorts,
  resizeToFitPorts,
} from "./port-layout";
import { conformStructuredPorts } from "./structured-ports";

/** The two text formats a schematic can be written in. */
export type SchematicFormat = "json" | "yaml";

/**
 * A worked example of the format, used as documentation. Every key is
 * optional except each component's `type`.
 */
export const SCHEMATIC_EXAMPLE_YAML = `\
schematic: Fetch Stage            # the diagram's title

components:                       # keyed by name; names must be unique
  pc_in:  { type: input, width: 32 }        # top-level pins: input / output / inout
  clk:    { type: input, role: clock }      # role: standard (default), clock, reset
  next_pc: { type: output, width: 32 }
  four:   { type: constant, width: 32 }

  pc:
    type: register                # d/q are this wide (default 32); clk/reset built in
    width: 32
    at: [20, 4]                   # optional grid position [x, y]; omitted = auto-layout

  adder:
    type: module
    sequential: false             # true adds clk and reset ports
    link: schematics/Adder.rtlproj  # optional: the schematic it stands for
    inputs: ["a[32]", "b[32]"]    # "name", "name[width]", "name[width] @side"
    outputs: ["sum[32]"]
    color: "#22c55e"
    size: [12, 8]                 # optional [width, height] in grid cells

  carry_xor:
    type: gate
    gate: XOR                     # AND NAND OR NOR XOR XNOR
    inputs: 2                     # a count (named a, b, c…) or a list of names
    rotation: right               # right (default), left, up, down
    tied: [b]                     # ports deliberately left unconnected

  sel_dec:
    type: decoder                 # or encoder
    bits: 2                       # 2-to-4 decoder (encoder: 4-to-2)
    outputs: [y0, y1, y2, "y3 @bottom"]   # optional: rename / re-side ports

  pick:
    type: mux
    bits: 1                       # select lines; 2^bits data inputs
    width: 32                     # data inputs and output are this wide
    inputs: [a, b]                # optional names: data inputs,
    selects: [sel]                #   select lines,
    output: y                     #   and the output

wires:
  - pc_in -> pc.d                 # single-pin components need no ".port"
  - pc.q -> adder.a
  - four -> adder.b
  - from: adder.sum               # long form: fan out, or add a label
    to: [next_pc]
    label: pc + 4
`;

// ── ERRORS ─────────────────────────────────────────────────────────────────

/** A schematic file that can't be turned into a diagram, with where and why. */
export class SchematicError extends Error {
  /**
   * @param path - Dotted location in the document, e.g. "components.alu.type".
   * @param problem - What's wrong there.
   */
  constructor(path: string, problem: string) {
    super(path ? `${path}: ${problem}` : problem);
    this.name = "SchematicError";
  }
}

// ── VOCABULARY ─────────────────────────────────────────────────────────────

const COMPONENT_TYPES = [
  "module",
  "register",
  "gate",
  "decoder",
  "encoder",
  "mux",
  "input",
  "output",
  "inout",
  "constant",
] as const;
type ComponentType = (typeof COMPONENT_TYPES)[number];

const GATE_TYPES: readonly GateType[] = ["AND", "NAND", "OR", "NOR", "XOR", "XNOR"];
const ROTATIONS: readonly GateRotation[] = ["right", "left", "up", "down"];
const SIDES: readonly PortSide[] = ["left", "right", "top", "bottom"];

/** Which side a module port lands on when its spec doesn't say. */
const DEFAULT_SIDE: Record<PortDirection, PortSide> = {
  in: "left",
  out: "right",
  inout: "bottom",
};

/** Module port-list keys and the direction each one declares. */
const PORT_LISTS = [
  ["inputs", "in"],
  ["outputs", "out"],
  ["inouts", "inout"],
] as const;

/** Width a register's d/q (and a new module's ports) get by default. */
const DEFAULT_REGISTER_WIDTH = 32;

// "name", "name[32]", "name @top", "name[32] @top"
const PORT_SPEC_PATTERN =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[\s*(\d+)\s*\])?\s*(?:@\s*(left|right|top|bottom))?\s*$/;

// ── VALIDATION HELPERS ─────────────────────────────────────────────────────

/** A plain object from parsed JSON/YAML. */
type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reject keys a spec doesn't know, so a typo ("inptus") fails loudly instead
 * of silently doing nothing.
 *
 * @param spec - The object to check.
 * @param allowed - Every key it may carry.
 * @param path - Its location, for the error message.
 */
function checkKeys(spec: Json, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(spec)) {
    if (!allowed.includes(key)) {
      throw new SchematicError(
        `${path}.${key}`,
        `unknown key (expected one of: ${allowed.join(", ")})`,
      );
    }
  }
}

function readOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  path: string,
  { caseInsensitive = false } = {},
): T {
  const text = typeof value === "string" ? value.trim() : value;
  const match = options.find((option) =>
    caseInsensitive && typeof text === "string"
      ? option.toLowerCase() === text.toLowerCase()
      : option === text,
  );
  if (match === undefined) {
    throw new SchematicError(path, `expected one of: ${options.join(", ")}`);
  }
  return match;
}

function readInteger(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new SchematicError(path, `expected a whole number from ${min} to ${max}`);
  }
  return value;
}

function readPair(value: unknown, min: number, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new SchematicError(path, "expected two numbers, like [4, 8]");
  }
  return [
    readInteger(value[0], min, 10_000, `${path}[0]`),
    readInteger(value[1], min, 10_000, `${path}[1]`),
  ];
}

function readName(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim())) {
    throw new SchematicError(
      path,
      "expected a name of letters, digits and _, not starting with a digit",
    );
  }
  return value.trim();
}

// ── PORTS ──────────────────────────────────────────────────────────────────

/** A port as written in a schematic, before it's placed on a block. */
interface PortSpec {
  name: string;
  width: number;
  side?: PortSide;
}

/**
 * Read one port spec — either the string shorthand or the long form
 * `{ name, width, side }`.
 *
 * @param value - The raw spec.
 * @param path - Its location, for errors.
 * @returns The parsed spec.
 */
function readPortSpec(value: unknown, path: string): PortSpec {
  if (typeof value === "string") {
    const match = PORT_SPEC_PATTERN.exec(value);
    if (!match) {
      throw new SchematicError(
        path,
        `"${value}" isn't a port; write "name", "name[width]" or "name[width] @side"`,
      );
    }
    const width = match[2]
      ? readInteger(Number(match[2]), MIN_BUS_WIDTH, MAX_BUS_WIDTH, path)
      : 1;
    return { name: match[1], width, side: match[3] as PortSide | undefined };
  }
  if (isObject(value)) {
    checkKeys(value, ["name", "width", "side"], path);
    return {
      name: readName(value.name, `${path}.name`),
      width:
        value.width === undefined
          ? 1
          : readInteger(value.width, MIN_BUS_WIDTH, MAX_BUS_WIDTH, `${path}.width`),
      side:
        value.side === undefined ? undefined : readOneOf(value.side, SIDES, `${path}.side`),
    };
  }
  throw new SchematicError(path, "expected a port string or { name, width, side }");
}

function readPortList(value: unknown, path: string): PortSpec[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item, index) => readPortSpec(item, `${path}[${index}]`));
}

/**
 * Add a port to a block on the next free slot of its side.
 *
 * @param block - The block to add to; mutated.
 * @param spec - The port's name, width and optional side.
 * @param direction - Its signal direction.
 */
function addPort(block: RtlBlock, spec: PortSpec, direction: PortDirection): void {
  const side = spec.side ?? DEFAULT_SIDE[direction];
  block.ports.push({
    id: nanoid(6),
    name: spec.name,
    side,
    direction,
    slot: nextFreeSlot(block, side),
    ...(spec.width > 1 ? { width: spec.width } : {}),
  });
}

/** Set the width of every non-clk/reset port on a block (register d/q). */
function setDataWidth(block: RtlBlock, width: number): void {
  for (const port of block.ports) {
    if (!isClockPort(port) && !isResetPort(port)) {
      port.width = width > 1 ? width : undefined;
    }
  }
}

/**
 * A codec's or mux's ports split into the lists its spec names them by —
 * `inputs`/`outputs` for a codec; `inputs`/`selects`/`output` for a mux —
 * each in port order.
 *
 * @param block - A codec or mux.
 * @returns [spec key, ports] pairs.
 */
function structuredPortLists(block: RtlBlock): [string, RtlPort[]][] {
  const ins = block.ports.filter((p) => p.direction === "in" && p.role !== "select");
  const outs = block.ports.filter((p) => p.direction === "out");
  return block.kind === "mux"
    ? [
        ["inputs", ins],
        ["selects", block.ports.filter((p) => p.role === "select")],
        ["output", outs],
      ]
    : [
        ["inputs", ins],
        ["outputs", outs],
      ];
}

/**
 * Apply a spec's names (and any sides) to one group of a codec's or mux's
 * ports, in order. The group's size is fixed by the component's settings,
 * so the list must match it exactly; widths come from the settings too and
 * a width written here is ignored.
 *
 * @param ports - The group's ports, in order; mutated.
 * @param specs - The names/sides the spec gives them.
 * @param path - The list's location, for errors.
 */
function renameStructuredPorts(ports: RtlPort[], specs: PortSpec[], path: string): void {
  if (specs.length !== ports.length) {
    throw new SchematicError(
      path,
      `expected ${ports.length} name(s) here — the count follows from bits`,
    );
  }
  specs.forEach((spec, index) => {
    ports[index].name = spec.name;
    if (spec.side) {
      ports[index].side = spec.side;
    }
  });
}

// ── COMPONENTS ─────────────────────────────────────────────────────────────

const COMMON_KEYS = ["type", "at", "size", "color"];
/** Every kind whose ports can be tied off also accepts a `tied` list. */
const TIEABLE_KEYS = [...COMMON_KEYS, "tied"];
const KEYS_BY_TYPE: Record<ComponentType, readonly string[]> = {
  module: [...TIEABLE_KEYS, "sequential", "inputs", "outputs", "inouts", "link"],
  register: [...TIEABLE_KEYS, "width"],
  gate: [...TIEABLE_KEYS, "gate", "inputs", "rotation"],
  decoder: [...TIEABLE_KEYS, "bits", "inputs", "outputs"],
  encoder: [...TIEABLE_KEYS, "bits", "inputs", "outputs"],
  mux: [...TIEABLE_KEYS, "bits", "width", "inputs", "selects", "output"],
  input: [...COMMON_KEYS, "width", "role"],
  output: [...COMMON_KEYS, "width"],
  inout: [...COMMON_KEYS, "width"],
  constant: [...COMMON_KEYS, "width"],
};

/** A component built from its spec, plus whether the spec placed it. */
interface BuiltComponent {
  block: RtlBlock;
  placed: boolean;
}

/**
 * Turn one component spec into a block.
 *
 * @param name - The component's name (its key under `components`).
 * @param spec - Its raw spec.
 * @param path - Its location, for errors.
 * @returns The block, laid out internally but not yet positioned unless
 *   the spec gave `at`.
 */
function buildComponent(name: string, spec: unknown, path: string): BuiltComponent {
  if (!isObject(spec)) {
    throw new SchematicError(path, "expected an object with at least a type");
  }
  const type = readOneOf(spec.type, COMPONENT_TYPES, `${path}.type`, {
    caseInsensitive: true,
  });
  checkKeys(spec, KEYS_BY_TYPE[type], path);

  const kind =
    type === "input" || type === "output" || type === "inout"
      ? "io"
      : type === "decoder" || type === "encoder"
        ? "codec"
        : type;
  const block = createBlock(kind, 0, 0);
  block.label = name;

  const width =
    spec.width === undefined
      ? undefined
      : readInteger(spec.width, MIN_BUS_WIDTH, MAX_BUS_WIDTH, `${path}.width`);

  switch (type) {
    case "module": {
      // A module starts from nothing but what the spec lists — the palette's
      // default in/out pair would be surprise ports here.
      block.ports = [];
      if (spec.sequential === true) {
        block.ports.push(
          { id: nanoid(6), name: "clk", side: "left", direction: "in", slot: 1 },
          { id: nanoid(6), name: "reset", side: "bottom", direction: "in", slot: 1 },
        );
      } else if (spec.sequential !== undefined && spec.sequential !== false) {
        throw new SchematicError(`${path}.sequential`, "expected true or false");
      }
      const seen = new Set(block.ports.map((port) => port.name));
      for (const [key, direction] of PORT_LISTS) {
        if (spec[key] === undefined) {
          continue;
        }
        readPortList(spec[key], `${path}.${key}`).forEach((port, index) => {
          if (seen.has(port.name)) {
            throw new SchematicError(
              `${path}.${key}[${index}]`,
              `port "${port.name}" is declared twice`,
            );
          }
          seen.add(port.name);
          addPort(block, port, direction);
        });
      }
      if (spec.link !== undefined) {
        if (typeof spec.link !== "string" || spec.link.trim() === "") {
          throw new SchematicError(
            `${path}.link`,
            'expected a project-relative schematic path, like "schematics/ALU.rtlproj"',
          );
        }
        // Only the path is known here; the ports are matched to the linked
        // schematic by name once the document is open in its project (see
        // state/module-links.ts).
        block.linkedModule = { name: "", path: spec.link.trim(), ports: [] };
      }
      break;
    }
    case "register":
      setDataWidth(block, width ?? DEFAULT_REGISTER_WIDTH);
      break;
    case "gate": {
      if (spec.gate !== undefined) {
        block.gateType = readOneOf(spec.gate, GATE_TYPES, `${path}.gate`, {
          caseInsensitive: true,
        });
      }
      if (spec.rotation !== undefined) {
        block.gateRotation = readOneOf(spec.rotation, ROTATIONS, `${path}.rotation`);
      }
      if (spec.inputs !== undefined) {
        const names =
          typeof spec.inputs === "number"
            ? Array.from(
                {
                  length: readInteger(
                    spec.inputs,
                    GATE_MIN_INPUTS,
                    GATE_MAX_INPUTS,
                    `${path}.inputs`,
                  ),
                },
                (_, i) => String.fromCharCode(97 + i),
              )
            : readPortList(spec.inputs, `${path}.inputs`).map((port) => port.name);
        if (names.length < GATE_MIN_INPUTS || names.length > GATE_MAX_INPUTS) {
          throw new SchematicError(
            `${path}.inputs`,
            `a gate takes ${GATE_MIN_INPUTS} to ${GATE_MAX_INPUTS} inputs`,
          );
        }
        const output = block.ports.find((port) => port.direction === "out");
        block.ports = [];
        names.forEach((portName) =>
          addPort(block, { name: portName, width: 1 }, "in"),
        );
        if (output) {
          block.ports.push(output);
        }
      }
      break;
    }
    case "decoder":
    case "encoder":
    case "mux": {
      if (type !== "mux") {
        block.codecType = type;
      }
      if (spec.bits !== undefined) {
        block.bits = readInteger(
          spec.bits,
          MIN_STRUCTURED_BITS,
          MAX_STRUCTURED_BITS,
          `${path}.bits`,
        );
      }
      if (type === "mux" && width !== undefined) {
        block.dataWidth = width;
      }
      block.ports = [];
      conformStructuredPorts(block);
      for (const [key, ports] of structuredPortLists(block)) {
        if (spec[key] !== undefined) {
          renameStructuredPorts(ports, readPortList(spec[key], `${path}.${key}`), `${path}.${key}`);
        }
      }
      const names = block.ports.map((p) => p.name);
      const duplicate = names.find((n, i) => names.indexOf(n) !== i);
      if (duplicate !== undefined) {
        throw new SchematicError(path, `port "${duplicate}" is declared twice`);
      }
      break;
    }
    case "input":
    case "output":
    case "inout": {
      // An I/O block's pin is named from the design's side: an *input* pin
      // drives into the design, so its port points out of the block.
      const pin = block.ports[0];
      pin.direction = type === "input" ? "out" : type === "output" ? "in" : "inout";
      pin.side = type === "output" ? "left" : "right";
      setDataWidth(block, width ?? 1);
      // An input can be a clock or reset pin (always 1 bit) instead of a
      // standard signal.
      if (spec.role !== undefined) {
        const role = readOneOf(spec.role, ["standard", "clock", "reset"] as const, `${path}.role`);
        if (role !== "standard") {
          block.ioRole = role;
        }
      }
      break;
    }
    case "constant":
      setDataWidth(block, width ?? 1);
      break;
  }

  if (spec.tied !== undefined) {
    const names = Array.isArray(spec.tied) ? spec.tied : [spec.tied];
    names.forEach((raw, index) => {
      const where = `${path}.tied[${index}]`;
      if (typeof raw !== "string") {
        throw new SchematicError(where, "expected a port name");
      }
      // Matched as plain text: a port's name may hold spaces ("Port 1").
      const port = block.ports.find((p) => p.name === raw.trim());
      if (!port) {
        throw new SchematicError(where, `"${name}" has no port "${String(raw)}"`);
      }
      if (!canTieOff(block.kind, port)) {
        throw new SchematicError(where, `"${port.name}" can't be tied off`);
      }
      port.tiedOff = true;
    });
  }

  if (spec.color !== undefined) {
    if (typeof spec.color !== "string" || !isValidHexColor(spec.color)) {
      throw new SchematicError(`${path}.color`, 'expected a hex color like "#5b8def"');
    }
    block.color = spec.color.toLowerCase();
  }

  // Same settling pass every edit in the store gets (diagram-store commit):
  // pin clk/reset, grow to fit the ports, then centre them.
  normalizeFixedPorts(block);
  growToFitPorts(block);
  if (spec.size !== undefined) {
    const [w, h] = readPair(spec.size, 1, `${path}.size`);
    block.width = w * GRID_SIZE;
    block.height = h * GRID_SIZE;
  }
  resizeToFitPorts(block, undefined);
  centerPortGroups(block);

  let placed = false;
  if (spec.at !== undefined) {
    const [x, y] = readPair(spec.at, -10_000, `${path}.at`);
    block.x = x * GRID_SIZE;
    block.y = y * GRID_SIZE;
    placed = true;
  }
  return { block, placed };
}

// ── WIRES ──────────────────────────────────────────────────────────────────

/**
 * Resolve "component.port" (or just "component" for a single-port
 * component) to a block and port.
 *
 * @param ref - The endpoint text.
 * @param blocks - Every component, by name.
 * @param path - Its location, for errors.
 * @returns The block and port it names.
 */
function resolveEndpoint(
  ref: unknown,
  blocks: ReadonlyMap<string, RtlBlock>,
  path: string,
): { block: RtlBlock; port: RtlPort } {
  if (typeof ref !== "string" || ref.trim() === "") {
    throw new SchematicError(path, 'expected an endpoint like "alu.y"');
  }
  const [blockName, portName, ...rest] = ref.trim().split(".");
  const block = blocks.get(blockName);
  if (!block || rest.length > 0) {
    throw new SchematicError(path, `no component named "${blockName}"`);
  }
  if (portName === undefined) {
    if (block.ports.length !== 1) {
      throw new SchematicError(
        path,
        `"${blockName}" has several ports; say which, like "${blockName}.${block.ports[0]?.name ?? "port"}"`,
      );
    }
    return { block, port: block.ports[0] };
  }
  const port = block.ports.find((p) => p.name === portName);
  if (!port) {
    throw new SchematicError(
      path,
      `"${blockName}" has no port "${portName}" (it has: ${block.ports.map((p) => p.name).join(", ")})`,
    );
  }
  return { block, port };
}

/**
 * Build one wire, oriented driver → receiver whichever way it was written.
 */
function buildWire(
  from: { block: RtlBlock; port: RtlPort },
  to: { block: RtlBlock; port: RtlPort },
  label: string | undefined,
  path: string,
): RtlWire {
  for (const end of [from, to]) {
    if (end.port.tiedOff) {
      throw new SchematicError(
        path,
        `${end.block.label}.${end.port.name} is tied off, so it can't be wired`,
      );
    }
  }
  if (!directionsCompatible(from.port.direction, to.port.direction)) {
    throw new SchematicError(
      path,
      `can't connect ${from.block.label}.${from.port.name} (${from.port.direction}) ` +
        `to ${to.block.label}.${to.port.name} (${to.port.direction})`,
    );
  }
  const width = from.port.width ?? 1;
  if (width !== (to.port.width ?? 1)) {
    throw new SchematicError(
      path,
      `width mismatch: ${from.block.label}.${from.port.name} is ${width} bit(s), ` +
        `${to.block.label}.${to.port.name} is ${to.port.width ?? 1}`,
    );
  }
  const [source, target] = to.port.direction === "out" ? [to, from] : [from, to];
  return {
    id: nanoid(8),
    sourceBlockId: source.block.id,
    sourcePortId: source.port.id,
    targetBlockId: target.block.id,
    targetPortId: target.port.id,
    label: label ?? (width > 1 ? formatBusWidth(width) : undefined),
  };
}

/**
 * Read one entry of `wires` — "a.y -> b.x, c.x" or `{ from, to, label }` —
 * into one wire per target.
 */
function buildWires(
  spec: unknown,
  blocks: ReadonlyMap<string, RtlBlock>,
  path: string,
): RtlWire[] {
  let from: unknown;
  let targets: unknown[];
  let label: string | undefined;
  if (typeof spec === "string") {
    const parts = spec.split("->");
    if (parts.length !== 2) {
      throw new SchematicError(path, 'expected "source -> target" (targets may be comma-separated)');
    }
    from = parts[0];
    targets = parts[1].split(",");
  } else if (isObject(spec)) {
    checkKeys(spec, ["from", "to", "label"], path);
    from = spec.from;
    targets = Array.isArray(spec.to) ? spec.to : [spec.to];
    if (spec.label !== undefined) {
      if (typeof spec.label !== "string") {
        throw new SchematicError(`${path}.label`, "expected text");
      }
      label = spec.label;
    }
  } else {
    throw new SchematicError(path, 'expected "source -> target" or { from, to }');
  }
  const source = resolveEndpoint(from, blocks, `${path} (from)`);
  return targets.map((target, index) =>
    buildWire(
      source,
      resolveEndpoint(target, blocks, `${path} (to #${index + 1})`),
      label,
      path,
    ),
  );
}

// ── AUTO-LAYOUT ────────────────────────────────────────────────────────────

/** Empty grid cells left between auto-placed components. */
const LAYOUT_GAP_CELLS = 6;

/**
 * Give every unplaced block a position: columns left to right by how far
 * each sits from the design's inputs along the wires, stacked top to bottom
 * within a column. Blocks placed by the spec stay put; the auto-placed ones
 * go below them so the two never overlap.
 *
 * @param built - Every component, in spec order.
 * @param wires - The wires between them, driver → receiver.
 */
function autoLayout(built: BuiltComponent[], wires: RtlWire[]): void {
  const unplaced = built.filter((c) => !c.placed).map((c) => c.block);
  if (unplaced.length === 0) {
    return;
  }

  // Longest-path depth from any driver-less block. Capped at the block
  // count so a feedback loop (a register's q back into its own logic)
  // can't push depths up forever.
  const depth = new Map(built.map((c) => [c.block.id, 0]));
  for (let pass = 0; pass < built.length; pass++) {
    let changed = false;
    for (const wire of wires) {
      const next = (depth.get(wire.sourceBlockId) ?? 0) + 1;
      if (next < built.length && next > (depth.get(wire.targetBlockId) ?? 0)) {
        depth.set(wire.targetBlockId, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  const placed = built.filter((c) => c.placed).map((c) => c.block);
  const top = placed.length
    ? Math.max(...placed.map((b) => b.y + b.height)) + LAYOUT_GAP_CELLS * GRID_SIZE
    : 0;

  const columns = new Map<number, RtlBlock[]>();
  for (const block of unplaced) {
    const column = depth.get(block.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), block]);
  }
  let x = 0;
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    let y = top;
    const blocks = columns.get(column) ?? [];
    for (const block of blocks) {
      block.x = x;
      block.y = y;
      y += block.height + LAYOUT_GAP_CELLS * GRID_SIZE;
    }
    x += Math.max(...blocks.map((b) => b.width)) + LAYOUT_GAP_CELLS * 2 * GRID_SIZE;
  }
}

// ── IMPORT ─────────────────────────────────────────────────────────────────

/**
 * Parse a schematic file into a diagram.
 *
 * @param text - The file's contents.
 * @param format - Which syntax it's written in.
 * @returns A new diagram, ready to load.
 * @throws SchematicError when the text isn't valid JSON/YAML or doesn't
 *   describe a valid schematic — the message says where and why.
 */
export function parseSchematic(text: string, format: SchematicFormat): RtlDiagram {
  let raw: unknown;
  try {
    raw = format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new SchematicError(
      "",
      `not valid ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isObject(raw)) {
    throw new SchematicError("", "expected a document with `components` (and optionally `schematic`, `wires`)");
  }
  checkKeys(raw, ["schematic", "components", "wires"], "(top level)");

  const title =
    raw.schematic === undefined ? "Imported Schematic" : String(raw.schematic).trim();

  const components = raw.components ?? {};
  if (!isObject(components)) {
    throw new SchematicError("components", "expected a map of name → component");
  }
  const built = Object.entries(components).map(([name, spec]) =>
    buildComponent(readName(name, `components.${name}`), spec, `components.${name}`),
  );
  const byName = new Map(built.map((c) => [c.block.label, c.block]));

  const wireSpecs = raw.wires ?? [];
  if (!Array.isArray(wireSpecs)) {
    throw new SchematicError("wires", "expected a list");
  }
  const wires = wireSpecs.flatMap((spec, index) =>
    buildWires(spec, byName, `wires[${index}]`),
  );

  autoLayout(built, wires);

  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    title: title || "Imported Schematic",
    blocks: built.map((c) => c.block),
    wires,
  };
}

// ── EXPORT ─────────────────────────────────────────────────────────────────

/** Write a port in the string shorthand, leaving out anything default. */
function portToSpec(port: RtlPort): string {
  const width = (port.width ?? 1) > 1 ? `[${port.width}]` : "";
  const side = port.side !== DEFAULT_SIDE[port.direction] ? ` @${port.side}` : "";
  return `${port.name}${width}${side}`;
}

/**
 * Describe one block as a component spec.
 */
function blockToSpec(block: RtlBlock): Json {
  const spec: Json = {};
  const dataPort = block.ports.find((p) => !isClockPort(p) && !isResetPort(p));
  const dataWidth = dataPort?.width ?? 1;

  switch (block.kind) {
    case "module": {
      spec.type = "module";
      if (block.ports.some(isClockPort)) {
        spec.sequential = true;
      }
      for (const [key, direction] of PORT_LISTS) {
        const ports = block.ports.filter(
          (p) => p.direction === direction && !isClockPort(p) && !isResetPort(p),
        );
        if (ports.length > 0) {
          spec[key] = ports.map(portToSpec);
        }
      }
      if (block.linkedModule?.path) {
        spec.link = block.linkedModule.path;
      }
      break;
    }
    case "register":
      spec.type = "register";
      spec.width = dataWidth;
      break;
    case "gate": {
      spec.type = "gate";
      spec.gate = block.gateType ?? "AND";
      const inputs = block.ports.filter((p) => p.direction === "in").map((p) => p.name);
      const defaultNames = inputs.every((n, i) => n === String.fromCharCode(97 + i));
      spec.inputs = defaultNames ? inputs.length : inputs;
      if (block.gateRotation && block.gateRotation !== "right") {
        spec.rotation = block.gateRotation;
      }
      break;
    }
    case "codec":
    case "mux": {
      spec.type = block.kind === "mux" ? "mux" : (block.codecType ?? "decoder");
      spec.bits = block.bits ?? MIN_STRUCTURED_BITS;
      if (block.kind === "mux" && (block.dataWidth ?? 1) > 1) {
        spec.width = block.dataWidth;
      }
      // Each group is written out only when a port in it was renamed or
      // moved off its default side — otherwise `bits` already says it all.
      const fresh = structuredClone(block);
      fresh.ports = [];
      conformStructuredPorts(fresh);
      const defaults = new Map(structuredPortLists(fresh));
      for (const [key, ports] of structuredPortLists(block)) {
        const reference = defaults.get(key) ?? [];
        const customized = ports.some(
          (p, i) => p.name !== reference[i]?.name || p.side !== reference[i]?.side,
        );
        if (customized) {
          const written = ports.map((p, i) =>
            p.side !== reference[i]?.side ? `${p.name} @${p.side}` : p.name,
          );
          spec[key] = key === "output" ? written[0] : written;
        }
      }
      break;
    }
    case "io":
      spec.type =
        dataPort?.direction === "out" ? "input" : dataPort?.direction === "in" ? "output" : "inout";
      if (dataWidth > 1) {
        spec.width = dataWidth;
      }
      if (block.ioRole) {
        spec.role = block.ioRole;
      }
      break;
    case "constant":
      spec.type = "constant";
      if (dataWidth > 1) {
        spec.width = dataWidth;
      }
      break;
  }

  const tied = block.ports.filter((p) => p.tiedOff).map((p) => p.name);
  if (tied.length > 0) {
    spec.tied = tied;
  }

  spec.at = [Math.round(block.x / GRID_SIZE), Math.round(block.y / GRID_SIZE)];
  spec.size = [Math.round(block.width / GRID_SIZE), Math.round(block.height / GRID_SIZE)];
  if (block.color) {
    spec.color = block.color;
  }
  return spec;
}

/**
 * Write a diagram as a schematic file, in the same format {@link parseSchematic}
 * reads — positions and sizes included, so a round trip keeps the layout.
 *
 * @param diagram - The diagram to describe.
 * @param format - Which syntax to write.
 * @returns The file's text.
 */
export function serializeSchematic(diagram: RtlDiagram, format: SchematicFormat): string {
  // Names must be unique keys; a clash (possible in a hand-edited diagram)
  // gets a numeric suffix rather than silently overwriting a component.
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const block of diagram.blocks) {
    const base = block.label.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(?=\d)/, "_") || "component";
    let name = base;
    for (let n = 2; used.has(name); n++) {
      name = `${base}_${n}`;
    }
    used.add(name);
    names.set(block.id, name);
  }

  const blockById = new Map(diagram.blocks.map((b) => [b.id, b]));
  const endpoint = (blockId: string, portId: string): string => {
    const block = blockById.get(blockId);
    const port = block?.ports.find((p) => p.id === portId);
    const name = names.get(blockId) ?? blockId;
    return block && block.ports.length === 1 ? name : `${name}.${port?.name ?? portId}`;
  };

  const doc = {
    schematic: diagram.title,
    components: Object.fromEntries(
      diagram.blocks.map((block) => [names.get(block.id), blockToSpec(block)]),
    ),
    wires: diagram.wires.map((wire) => {
      const arrow = `${endpoint(wire.sourceBlockId, wire.sourcePortId)} -> ${endpoint(
        wire.targetBlockId,
        wire.targetPortId,
      )}`;
      const width =
        blockById.get(wire.sourceBlockId)?.ports.find((p) => p.id === wire.sourcePortId)
          ?.width ?? 1;
      const defaultLabel = width > 1 ? formatBusWidth(width) : undefined;
      if (!wire.label || wire.label === defaultLabel) {
        return arrow;
      }
      const [from, to] = arrow.split(" -> ");
      return { from, to, label: wire.label };
    }),
  };

  if (format === "json") {
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  // Short lists read best inline — `at: [20, 4]`, `inputs: [a, b]` — the
  // way the example above writes them; the wire list stays one per line.
  const yamlDoc = new Document(doc);
  visit(yamlDoc, {
    Pair(_, pair) {
      if (
        isScalar(pair.key) &&
        INLINE_LIST_KEYS.has(String(pair.key.value)) &&
        isSeq(pair.value)
      ) {
        pair.value.flow = true;
      }
    },
  });
  return yamlDoc.toString({ flowCollectionPadding: false, lineWidth: 0 });
}

/** Keys whose list values are written inline in YAML output. */
const INLINE_LIST_KEYS = new Set([
  "at",
  "size",
  "inputs",
  "outputs",
  "inouts",
  "selects",
  "tied",
  "to",
]);
