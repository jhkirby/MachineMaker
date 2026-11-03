/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Values on a simulated signal: what a bus of a given width can carry, and
// reading one typed by hand. BigInt throughout — a bus can be up to 1024
// bits wide, far past what a plain number holds exactly.

import type { RtlBlock, RtlDiagram } from "../../../shared/diagram-model";
import { isClockPort } from "../../../shared/diagram-model";

/** One top-level input the simulation is driven from. */
export interface SignalInput {
  /** The I/O block's id — what its value is stored under. */
  id: string;
  /** The I/O block's name. */
  name: string;
  /** Bus width in bits. */
  width: number;
}

/**
 * How a simulated value is shown: decimal, or "X" when it's unknown
 * (nothing drives it, or it depends on something that isn't known).
 *
 * @param value - The value.
 * @returns Its display text.
 */
export function formatSignalValue(value: bigint | undefined): string {
  return value === undefined ? "X" : value.toString();
}

/**
 * The same value in hex and binary, for a tooltip.
 *
 * @param value - The value.
 * @param width - Its bus width in bits.
 * @returns e.g. "0x1f · 0b11111", or "unknown".
 */
export function describeSignalValue(value: bigint | undefined, width: number): string {
  if (value === undefined) {
    return "unknown";
  }
  return `0x${value.toString(16)} · 0b${value.toString(2).padStart(width, "0")}`;
}

/**
 * What share of a signal's bits are 1 — how "lit" its wire is drawn in
 * Simulate mode: 0 for all-zero, 1 for all-ones, 0.5 for any 4 of 8.
 *
 * @param value - The value.
 * @param width - Its bus width in bits.
 * @returns A fraction in [0, 1], or undefined when the value is unknown.
 */
export function activeFraction(value: bigint | undefined, width: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  let ones = 0;
  for (let rest = value; rest > 0n; rest >>= 1n) {
    ones += Number(rest & 1n);
  }
  return ones / Math.max(1, width);
}

/**
 * The largest value a bus of `width` bits can carry.
 *
 * @param width - Bits.
 * @returns 2^width − 1.
 */
export function maxSignalValue(width: number): bigint {
  return (1n << BigInt(width)) - 1n;
}

/**
 * Read a value typed into a signal's box: decimal, or `0x`/`0b`/`0o`
 * prefixed hex/binary/octal, `_` allowed as a digit separator — and within
 * what the signal's width can carry.
 *
 * @param text - What was typed.
 * @param width - The signal's width in bits.
 * @returns The value, or null if it isn't a number the signal can carry.
 */
export function parseSignalValue(text: string, width: number): bigint | null {
  const cleaned = text.trim().replace(/_/g, "").toLowerCase();
  if (!/^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/.test(cleaned)) {
    return null;
  }
  const value = BigInt(cleaned);
  return value <= maxSignalValue(width) ? value : null;
}

/**
 * The schematic's top-level inputs — every I/O block whose pin drives into
 * the design (bidirectional ones too), in the schematic's own order —
 * except clock and reset pins, which the Clock and Reset buttons drive.
 *
 * @param diagram - The schematic.
 * @returns Its inputs.
 */
export function signalInputs(diagram: RtlDiagram): SignalInput[] {
  return diagram.blocks
    .filter(
      (block) =>
        block.kind === "io" &&
        !block.ioRole &&
        (block.ports[0]?.direction === "out" || block.ports[0]?.direction === "inout"),
    )
    .map((block) => ({
      id: block.id,
      name: block.label,
      width: block.ports[0]?.width ?? 1,
    }));
}

/** One top-level output the simulation is read from. */
export interface SignalOutput extends SignalInput {
  /** Where its value is found in the simulation's port values. */
  portKey: string;
}

/**
 * The schematic's top-level outputs — every I/O block whose pin is driven
 * by the design — in the schematic's own order.
 *
 * @param diagram - The schematic.
 * @returns Its outputs.
 */
export function signalOutputs(diagram: RtlDiagram): SignalOutput[] {
  return diagram.blocks
    .filter((block) => block.kind === "io" && block.ports[0]?.direction === "in")
    .map((block) => ({
      id: block.id,
      name: block.label,
      width: block.ports[0]?.width ?? 1,
      portKey: `${block.id}/${block.ports[0]?.id}`,
    }));
}

/**
 * Whether a block holds state that a clock edge advances: a register, or a
 * sequential module (one with a clk).
 *
 * @param block - Any block.
 * @returns True for a clocked element.
 */
export function isClockedElement(block: RtlBlock): boolean {
  return (
    block.kind === "register" ||
    (block.kind === "module" && block.ports.some(isClockPort))
  );
}
