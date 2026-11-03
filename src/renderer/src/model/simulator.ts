/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// The simulation engine: given a schematic, the values driven onto its
// inputs, and the state its registers hold, works out the value on every
// port — and, for a clock edge, the state every register takes next.
// Pure: no store, no DOM, so it can be checked in isolation.
//
// Values are BigInt bit-vectors masked to their port's width. `undefined`
// means unknown ("X") — a port nothing drives, or logic fed by one.
//
// Semantics, per kind:
//   io        an input pin drives the value set for it; an output pin
//             shows what's wired into it. A clock pin reads 0 and a reset
//             pin 1 (inactive) — the Clock and Reset buttons act instead.
//   constant  drives 0 (constants have no value field yet).
//   gate      bitwise AND/NAND/OR/NOR/XOR/XNOR of its 1-bit inputs.
//   codec     decoder: one-hot output at the index its inputs spell
//             (input 0 is the low bit); encoder: the index of the highest
//             input that's 1 (priority encoder), 0 if none is.
//   mux       the data input the select lines spell (select 0 = low bit).
//   register  q holds its state; reset low (active-low) forces it to 0.
//             A clock edge loads d.
//   module    runs its linked schematic: its inputs drive that schematic's
//             I/O pins (clk/reset feed I/O named clk/reset), and its
//             outputs read that schematic's output pins.

import {
  isClockPort,
  isResetPort,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
} from "../../../shared/diagram-model";
import { isLinkedModule } from "../../../shared/module-interface";

/** A simulated value: a bit-vector, or undefined for unknown. */
export type SignalValue = bigint | undefined;

/** Register contents, by path ("blockId", or "moduleId/…/blockId" nested). */
export type RegisterState = ReadonlyMap<string, bigint>;

/** Finds a linked schematic by project-relative path (undefined: not loaded). */
export type SchematicResolver = (relative: string) => RtlDiagram | null | undefined;

/** The outcome of settling one schematic. */
export interface SimulationResult {
  /** Every top-level port's value, keyed `${blockId}/${portId}`. */
  ports: ReadonlyMap<string, SignalValue>;
}

/** Deepest a module may nest before the engine gives up (a guard only —
 *  linking already refuses cycles). */
const MAX_DEPTH = 32;

/**
 * Keep the low `width` bits of a value.
 *
 * @param value - The value.
 * @param width - Bits to keep.
 * @returns The masked value.
 */
function mask(value: bigint, width: number): bigint {
  return value & ((1n << BigInt(width)) - 1n);
}

/**
 * The key a port's value is stored under.
 *
 * @param blockId - The owning block.
 * @param portId - The port.
 * @returns The key.
 */
function portKey(blockId: string, portId: string): string {
  return `${blockId}/${portId}`;
}

/**
 * Read a list of 1-bit values as a binary number, the first as the low bit.
 *
 * @param bits - The bits.
 * @returns The number, or undefined if any bit is unknown.
 */
function bitsToIndex(bits: readonly SignalValue[]): number | undefined {
  let index = 0;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i];
    if (bit === undefined) {
      return undefined;
    }
    if (bit & 1n) {
      index |= 1 << i;
    }
  }
  return index;
}

/** One schematic being settled: its port values and the registers it read. */
interface Evaluation {
  values: Map<string, SignalValue>;
  /** Each register's (by path) d input and whether its reset is asserted. */
  registers: Map<string, { d: SignalValue; reset: boolean }>;
}

/**
 * Simulates a schematic, including every linked module inside it.
 */
export class CircuitSimulator {
  /**
   * @param root - The schematic being simulated.
   * @param resolve - Finds the schematics its modules link to.
   */
  constructor(
    private readonly root: RtlDiagram,
    private readonly resolve: SchematicResolver,
  ) {}

  /**
   * Settle the schematic: every port's value for these inputs and state.
   *
   * @param inputs - Values driven onto input pins, by I/O block id
   *   (missing ones read 0).
   * @param state - Register contents.
   * @returns Every top-level port's value.
   */
  evaluate(inputs: ReadonlyMap<string, bigint>, state: RegisterState): SimulationResult {
    return { ports: this.settle(this.root, this.rootPins(inputs), state, "", 0).values };
  }

  /**
   * What drives the top-level schematic's input pins: the values set for
   * standard ones; a clock pin idles at 0 and a reset pin at 1 (reset is
   * active-low), since the Clock and Reset buttons do their work directly.
   *
   * @param inputs - Values set for standard input pins.
   * @returns Pin values by I/O block id.
   */
  private rootPins(inputs: ReadonlyMap<string, bigint>): Map<string, SignalValue> {
    const pins = new Map<string, SignalValue>();
    for (const block of this.root.blocks) {
      if (block.kind !== "io" || block.ports[0]?.direction === "in") {
        continue;
      }
      pins.set(
        block.id,
        block.ioRole === "clock" ? 0n : block.ioRole === "reset" ? 1n : (inputs.get(block.id) ?? 0n),
      );
    }
    return pins;
  }

  /**
   * The register contents after one clock edge: every register (nested
   * ones too) loads its d input — or 0 while its reset is asserted. A
   * register whose d is unknown keeps what it had.
   *
   * @param inputs - Values driven onto input pins.
   * @param state - Register contents before the edge.
   * @returns Register contents after it.
   */
  clock(inputs: ReadonlyMap<string, bigint>, state: RegisterState): Map<string, bigint> {
    const { registers } = this.settle(this.root, this.rootPins(inputs), state, "", 0);
    const next = new Map(state);
    for (const [path, { d, reset }] of registers) {
      if (reset) {
        next.set(path, 0n);
      } else if (d !== undefined) {
        next.set(path, d);
      }
    }
    return next;
  }

  /**
   * Settle one schematic instance: push values along wires and through
   * blocks until nothing changes (or a combinational loop keeps it from
   * settling, in which case the last pass stands).
   *
   * @param diagram - The schematic.
   * @param pins - Values driven onto its I/O pins from outside, by I/O
   *   block id.
   * @param state - All register contents (paths are global).
   * @param prefix - This instance's path prefix for register keys.
   * @param depth - How deep in the module hierarchy this is.
   * @returns Its port values and its registers' next-state inputs.
   */
  private settle(
    diagram: RtlDiagram,
    pins: ReadonlyMap<string, SignalValue>,
    state: RegisterState,
    prefix: string,
    depth: number,
  ): Evaluation {
    const values = new Map<string, SignalValue>();
    const registers = new Map<string, { d: SignalValue; reset: boolean }>();
    const passes = diagram.blocks.length * 2 + 4;

    for (let pass = 0; pass < passes; pass++) {
      let changed = false;
      const set = (key: string, value: SignalValue) => {
        if (values.get(key) !== value) {
          values.set(key, value);
          changed = true;
        }
      };
      for (const wire of diagram.wires) {
        set(
          portKey(wire.targetBlockId, wire.targetPortId),
          values.get(portKey(wire.sourceBlockId, wire.sourcePortId)),
        );
      }
      for (const block of diagram.blocks) {
        this.evaluateBlock(block, values, pins, state, prefix, depth, registers, set);
      }
      if (!changed) {
        break;
      }
    }
    return { values, registers };
  }

  /**
   * Work out one block's outputs from its inputs' current values.
   *
   * @param block - The block.
   * @param values - Port values so far (read).
   * @param pins - Values driven onto I/O pins from outside.
   * @param state - All register contents.
   * @param prefix - The instance's register path prefix.
   * @param depth - Module nesting depth.
   * @param registers - Collects each register's next-state inputs.
   * @param set - Writes a port value.
   */
  private evaluateBlock(
    block: RtlBlock,
    values: ReadonlyMap<string, SignalValue>,
    pins: ReadonlyMap<string, SignalValue>,
    state: RegisterState,
    prefix: string,
    depth: number,
    registers: Map<string, { d: SignalValue; reset: boolean }>,
    set: (key: string, value: SignalValue) => void,
  ): void {
    const read = (port: RtlPort | undefined): SignalValue =>
      port ? values.get(portKey(block.id, port.id)) : undefined;
    const write = (port: RtlPort | undefined, value: SignalValue) => {
      if (port) {
        set(portKey(block.id, port.id), value === undefined ? undefined : mask(value, port.width ?? 1));
      }
    };
    const ins = block.ports.filter((p) => p.direction === "in");
    const outs = block.ports.filter((p) => p.direction === "out");

    switch (block.kind) {
      case "io": {
        const pin = block.ports[0];
        if (pin && pin.direction !== "in") {
          write(pin, pins.get(block.id));
        }
        return;
      }
      case "constant":
        write(block.ports[0], 0n);
        return;
      case "gate": {
        write(outs[0], this.gate(block, ins.map(read)));
        return;
      }
      case "codec": {
        const index = bitsToIndex(ins.map(read));
        if (block.codecType === "encoder") {
          let highest = -1;
          let known = true;
          ins.forEach((port, i) => {
            const bit = read(port);
            if (bit === undefined) {
              known = false;
            } else if (bit & 1n) {
              highest = i;
            }
          });
          const encoded = known ? BigInt(Math.max(highest, 0)) : undefined;
          outs.forEach((port, i) =>
            write(port, encoded === undefined ? undefined : (encoded >> BigInt(i)) & 1n),
          );
        } else {
          outs.forEach((port, i) =>
            write(port, index === undefined ? undefined : i === index ? 1n : 0n),
          );
        }
        return;
      }
      case "mux": {
        const data = ins.filter((p) => p.role !== "select");
        const selects = ins.filter((p) => p.role === "select");
        const index = bitsToIndex(selects.map(read));
        write(outs[0], index === undefined ? undefined : read(data[index]));
        return;
      }
      case "register": {
        const path = `${prefix}${block.id}`;
        const reset = block.ports.find(isResetPort);
        const d = ins.find((p) => !isClockPort(p) && !isResetPort(p));
        // Active-low: the reset port is drawn with an inversion bubble.
        const resetAsserted = reset !== undefined && read(reset) === 0n;
        registers.set(path, { d: read(d), reset: resetAsserted });
        write(outs[0], resetAsserted ? 0n : (state.get(path) ?? 0n));
        return;
      }
      case "module":
        this.evaluateModule(block, read, write, state, prefix, depth, registers);
        return;
    }
  }

  /**
   * A gate's output for its input bits.
   *
   * @param block - The gate.
   * @param inputs - Its inputs' values.
   * @returns The output bit, or undefined if any input is unknown.
   */
  private gate(block: RtlBlock, inputs: readonly SignalValue[]): SignalValue {
    if (inputs.length === 0 || inputs.some((v) => v === undefined)) {
      return undefined;
    }
    const bits = inputs.map((v) => (v as bigint) & 1n);
    switch (block.gateType ?? "AND") {
      case "AND":
        return bits.every((b) => b === 1n) ? 1n : 0n;
      case "NAND":
        return bits.every((b) => b === 1n) ? 0n : 1n;
      case "OR":
        return bits.some((b) => b === 1n) ? 1n : 0n;
      case "NOR":
        return bits.some((b) => b === 1n) ? 0n : 1n;
      case "XOR":
        return bits.reduce((a, b) => a ^ b, 0n);
      case "XNOR":
        return bits.reduce((a, b) => a ^ b, 0n) ^ 1n;
    }
  }

  /**
   * Run a linked module's schematic for the module's current input values,
   * and drive the module's outputs from that schematic's output pins. An
   * unlinked module (or one whose schematic isn't available) drives unknown.
   *
   * @param block - The module.
   * @param read - Reads one of the module's port values.
   * @param write - Writes one of the module's port values.
   * @param state - All register contents.
   * @param prefix - The parent instance's register path prefix.
   * @param depth - Module nesting depth.
   * @param registers - Collects nested registers' next-state inputs.
   */
  private evaluateModule(
    block: RtlBlock,
    read: (port: RtlPort | undefined) => SignalValue,
    write: (port: RtlPort | undefined, value: SignalValue) => void,
    state: RegisterState,
    prefix: string,
    depth: number,
    registers: Map<string, { d: SignalValue; reset: boolean }>,
  ): void {
    const child =
      isLinkedModule(block) && depth < MAX_DEPTH
        ? this.resolve(block.linkedModule!.path!)
        : undefined;
    const outs = block.ports.filter((p) => p.direction === "out");
    if (!child) {
      outs.forEach((port) => write(port, undefined));
      return;
    }

    // The module's ports drive the child's I/O pins of the same source;
    // its clk/reset (never interface pins) feed I/O named clk/reset.
    const pins = new Map<string, SignalValue>();
    const clk = block.ports.find(isClockPort);
    const reset = block.ports.find(isResetPort);
    for (const io of child.blocks) {
      if (io.kind !== "io" || io.ports[0]?.direction === "in") {
        continue;
      }
      const named = { name: io.label } as RtlPort;
      const source =
        io.ioRole === "clock" || (!io.ioRole && isClockPort(named))
        ? clk
        : io.ioRole === "reset" || (!io.ioRole && isResetPort(named))
          ? reset
          : block.ports.find((p) => p.direction !== "out" && p.sourceId === io.id);
      pins.set(io.id, read(source));
    }

    const inner = this.settle(child, pins, state, `${prefix}${block.id}/`, depth + 1);
    inner.registers.forEach((entry, path) => registers.set(path, entry));
    for (const port of outs) {
      const io = child.blocks.find((b) => b.id === port.sourceId);
      const pin = io?.ports[0];
      write(port, io && pin ? inner.values.get(portKey(io.id, pin.id)) : undefined);
    }
  }
}
