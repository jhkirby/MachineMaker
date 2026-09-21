/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { nanoid } from "nanoid";
import type {
  BlockKind,
  PortDirection,
  PortSide,
  RtlBlock,
  RtlPort,
} from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";
import { nextNumberedName } from "./naming";

/** A port slot in a template, before an id is assigned. */
interface PortTemplate {
  name: string;
  side: PortSide;
  direction: PortDirection;
  /** 1-based grid slot along the side; must stay an interior point. */
  slot: number;
  /** Bus width in bits; omitted means a 1-bit wire. */
  width?: number;
}

/** Multiply grid cells by the pitch so every default size lands on gridlines. */
const cells = (count: number): number => count * GRID_SIZE;

/** Palette entry describing how to stamp out one kind of block. */
export interface ComponentTemplate {
  kind: BlockKind;
  /** Label shown in the palette. */
  displayName: string;
  /**
   * Prefix for auto-numbered block labels ("Module 1", "Port 2", …). Falls back
   * to {@link displayName} when omitted.
   */
  baseName?: string;
  /** One-line hint shown as a tooltip in the palette. */
  hint: string;
  defaultWidth: number;
  defaultHeight: number;
  ports: PortTemplate[];
}

// ── TEMPLATE TABLE ─────────────────────────────────────────────────────────

/** Every component the palette offers, in display order. */
export const COMPONENT_LIBRARY: readonly ComponentTemplate[] = [
  {
    kind: "module",
    displayName: "Module",
    hint: "Generic RTL submodule with configurable ports",
    defaultWidth: cells(12),
    defaultHeight: cells(8),
    // clk and reset's slots here are provisional: the diagram store's commit
    // wrapper normalizes them to their fixed positions (clk last on the
    // left, reset first on the bottom) right after a block is stamped out —
    // see normalizeFixedPorts in model/port-layout.ts.
    ports: [
      { name: "clk", side: "left", direction: "in", slot: 2 },
      { name: "reset", side: "bottom", direction: "in", slot: 1 },
      { name: "in", side: "left", direction: "in", slot: 4, width: 32 },
      { name: "out", side: "right", direction: "out", slot: 4, width: 32 },
    ],
  },
  {
    kind: "register",
    displayName: "Register",
    hint: "Edge-triggered flip-flop / pipeline register",
    defaultWidth: cells(10),
    defaultHeight: cells(8),
    // clk's slot here is provisional, same as a module's — normalizeFixedPorts
    // (model/port-layout.ts) pins it to the bottom of the left edge right
    // after the block is stamped out.
    ports: [
      { name: "clk", side: "left", direction: "in", slot: 2 },
      { name: "d", side: "left", direction: "in", slot: 4, width: 32 },
      { name: "q", side: "right", direction: "out", slot: 4, width: 32 },
    ],
  },
  {
    kind: "io",
    displayName: "I/O Port",
    baseName: "Port",
    hint: "Top-level input or output pin",
    defaultWidth: cells(8),
    defaultHeight: cells(4),
    ports: [{ name: "pin", side: "right", direction: "out", slot: 2, width: 32 }],
  },
  {
    kind: "constant",
    displayName: "Constant",
    hint: "Tie-off / literal value",
    defaultWidth: cells(6),
    defaultHeight: cells(4),
    ports: [{ name: "val", side: "right", direction: "out", slot: 2 }],
  },
];

/**
 * Look up a template by kind.
 *
 * @param kind - The block kind to resolve.
 * @returns The matching template.
 * @throws {Error} If no template is registered for the kind.
 */
export function templateFor(kind: BlockKind): ComponentTemplate {
  const template = COMPONENT_LIBRARY.find((entry) => entry.kind === kind);
  if (!template) {
    throw new Error(`No component template registered for kind "${kind}".`);
  }
  return template;
}

/**
 * Next auto-numbered label for a new block of `kind`: the template's base
 * name followed by the lowest number not already worn by a sibling with that
 * same base name — see {@link nextNumberedName}.
 *
 * @param kind - The block kind being stamped.
 * @param existingLabels - Labels of the blocks already in the diagram.
 * @returns e.g. "Module 2".
 */
export function nextBlockLabel(
  kind: BlockKind,
  existingLabels: readonly string[],
): string {
  const template = templateFor(kind);
  return nextNumberedName(template.baseName ?? template.displayName, existingLabels);
}

/**
 * Instantiate a fresh block from a template at the given canvas position.
 *
 * @param kind - Which template to stamp.
 * @param x - Canvas x of the block's top-left corner.
 * @param y - Canvas y of the block's top-left corner.
 * @param existingLabels - Labels already in the diagram, used to pick the next
 *   free number for this block's auto-generated name.
 * @returns A new block with freshly generated ids.
 */
export function createBlock(
  kind: BlockKind,
  x: number,
  y: number,
  existingLabels: readonly string[] = [],
): RtlBlock {
  const template = templateFor(kind);
  const ports: RtlPort[] = template.ports.map((port) => ({
    id: nanoid(6),
    name: port.name,
    side: port.side,
    direction: port.direction,
    slot: port.slot,
    width: port.width,
  }));
  return {
    id: nanoid(8),
    kind,
    label: nextBlockLabel(kind, existingLabels),
    x,
    y,
    width: template.defaultWidth,
    height: template.defaultHeight,
    ports,
  };
}

/** Prefix for auto-numbered port names ("Port 1", "Port 2", …). */
const PORT_BASE_NAME = "Port";

/**
 * Next auto-numbered name for a new port: the lowest number not already worn
 * by a sibling port — see {@link nextNumberedName}.
 *
 * @param existingNames - Names of the ports already on the block.
 * @returns e.g. "Port 2".
 */
export function nextPortName(existingNames: readonly string[]): string {
  return nextNumberedName(PORT_BASE_NAME, existingNames);
}

/**
 * Create a new port for an existing block at a chosen grid slot.
 *
 * @param side - Which edge the port should attach to.
 * @param direction - Signal direction for the new port.
 * @param slot - 1-based grid slot along the side (see {@link RtlPort.slot}).
 * @param existingNames - Names of the block's other ports, used to pick a
 *   free auto-numbered name.
 * @returns A new port with a generated id.
 */
export function createPort(
  side: PortSide,
  direction: PortDirection,
  slot: number,
  existingNames: readonly string[] = [],
): RtlPort {
  return {
    id: nanoid(6),
    name: nextPortName(existingNames),
    side,
    direction,
    slot,
  };
}
