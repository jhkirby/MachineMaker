/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// The rules that tie a module block to the schematic it's linked to: what a
// schematic's interface is, when a module's ports match it, and what makes
// a schematic "registered" (able to sit behind a sequential module). Pure
// and DOM-free, so the renderer and the main process share one definition.

import {
  isClockPort,
  isResetPort,
  type ModuleDefinition,
  type ModulePortDefinition,
  type PortDirection,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
} from "./diagram-model";

/**
 * Which way a module port faces, given the I/O pin in the linked schematic
 * it comes from. A pin is named from the design's side: one that drives
 * "out" of its I/O block feeds the design, so it's the module's *input*.
 */
const MODULE_DIRECTION_OF_PIN: Record<PortDirection, PortDirection> = {
  out: "in",
  in: "out",
  inout: "inout",
};

/**
 * Whether a port is clk or reset by name — structural on a module, set by
 * its own Mode toggle, so never part of a linked interface.
 *
 * @param name - The port's (or I/O component's) name.
 * @returns True for a clock or reset name.
 */
function isClockOrResetName(name: string): boolean {
  const probe = { name } as RtlPort;
  return isClockPort(probe) || isResetPort(probe);
}

/**
 * The interface a schematic presents when a module links to it: one port
 * per I/O component (named after it, facing the way it feeds the design,
 * as wide as its pin), minus any named clk or reset.
 *
 * @param diagram - The linked schematic.
 * @param path - Its project-relative path, recorded on the definition.
 * @returns The definition, ports in the schematic's own block order.
 */
export function moduleInterfaceOf(
  diagram: RtlDiagram,
  path: string,
): ModuleDefinition {
  const ports: ModulePortDefinition[] = [];
  for (const block of diagram.blocks) {
    const pin = block.ports[0];
    if (block.kind !== "io" || !pin || isClockOrResetName(block.label)) {
      continue;
    }
    ports.push({
      name: block.label,
      direction: MODULE_DIRECTION_OF_PIN[pin.direction],
      ...((pin.width ?? 1) > 1 ? { width: pin.width } : {}),
      sourceId: block.id,
    });
  }
  return { name: diagram.title, path, ports };
}

/**
 * A port's identity for matching: name, direction and width.
 *
 * @param port - A module port or interface port.
 * @returns A comparable key.
 */
function signature(port: { name: string; direction: PortDirection; width?: number }): string {
  return `${port.name}\u0000${port.direction}\u0000${port.width ?? 1}`;
}

/**
 * The ports of a module block that take part in linking — all but clk and
 * reset, which belong to the parent's Mode toggle.
 *
 * @param block - A module block.
 * @returns Its linkable ports.
 */
export function linkablePorts(block: RtlBlock): RtlPort[] {
  return block.ports.filter((port) => !isClockOrResetName(port.name));
}

/**
 * Whether a module's ports already match an interface: the same set of
 * name + direction + width, in any order and on any side.
 *
 * @param block - The module block.
 * @param definition - The interface to compare with.
 * @returns True if linking would change none of its ports.
 */
export function portsMatch(block: RtlBlock, definition: ModuleDefinition): boolean {
  const mine = linkablePorts(block).map(signature).sort();
  const theirs = definition.ports.map(signature).sort();
  return mine.length === theirs.length && mine.every((key, i) => key === theirs[i]);
}

/**
 * Whether two interfaces are identical — title, and every port's source,
 * name, direction and width, in order. Used to skip re-syncing a module
 * whose linked schematic changed nothing that matters to it.
 *
 * @param a - One interface.
 * @param b - The other.
 * @returns True if nothing differs.
 */
export function sameInterface(a: ModuleDefinition, b: ModuleDefinition): boolean {
  return (
    a.name === b.name &&
    a.path === b.path &&
    a.ports.length === b.ports.length &&
    a.ports.every((port, i) => {
      const other = b.ports[i];
      return port.sourceId === other.sourceId && signature(port) === signature(other);
    })
  );
}

/**
 * Whether a schematic holds state of its own — a register, or a nested
 * sequential module (one with a clk) — so that a sequential module linked
 * to it has something to clock.
 *
 * @param diagram - The linked schematic.
 * @returns True if it has a registered element.
 */
export function hasRegisteredElement(diagram: RtlDiagram): boolean {
  return diagram.blocks.some(
    (block) =>
      block.kind === "register" ||
      (block.kind === "module" && block.ports.some(isClockPort)),
  );
}

/**
 * Whether a module block is linked to a schematic.
 *
 * @param block - Any block.
 * @returns True for a module with a linked schematic path.
 */
export function isLinkedModule(block: RtlBlock): boolean {
  return block.kind === "module" && !!block.linkedModule?.path;
}
