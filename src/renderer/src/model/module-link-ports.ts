/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Bringing a module block's ports in line with the schematic it's linked
// to (see shared/module-interface.ts for what that interface is). Used both
// when a module is first linked and whenever its schematic changes.

import { nanoid } from "nanoid";
import {
  createEmptyDiagram,
  isClockPort,
  type IoRole,
  type ModuleDefinition,
  type PortDirection,
  type PortSide,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
} from "../../../shared/diagram-model";
import { linkablePorts } from "../../../shared/module-interface";
import { createBlock } from "./component-library";
import { GRID_SIZE } from "./grid";
import { growToFitPorts } from "./port-layout";

/** Side a newly added module port starts on, by direction. */
const DEFAULT_SIDE: Record<PortDirection, PortSide> = {
  in: "left",
  out: "right",
  inout: "bottom",
};

/**
 * A name nothing else on the block wears: `preferred`, or it with a
 * numeric suffix when a sibling (say, a port renamed locally in this
 * schematic) already has it.
 *
 * @param preferred - The name the interface gives the port.
 * @param taken - Names already in use; the result is added to it.
 * @returns A free name.
 */
function claimName(preferred: string, taken: Set<string>): string {
  let name = preferred;
  for (let n = 2; taken.has(name); n++) {
    name = `${preferred}_${n}`;
  }
  taken.add(name);
  return name;
}

/**
 * Reshape a module's ports to an interface, keeping as much as possible:
 *
 * - a port already mirroring an interface port (same source I/O component)
 *   stays, wires and all — following that component's rename unless the
 *   port was renamed locally here, which is kept;
 * - otherwise a port with the interface port's name is adopted;
 * - a kept port whose direction or width no longer fits takes the new
 *   shape under a new id, which drops its wires (they'd no longer fit);
 * - interface ports with no counterpart are added, empty — leaving the
 *   schematic invalid until they're wired or tied off;
 * - every other port goes, along with its wires (pruned by the store's
 *   commit, which drops wires to ports that no longer exist).
 *
 * clk and reset aren't part of any interface and are left alone.
 *
 * @param block - The module; its ports and link are replaced in place.
 * @param next - The interface to match.
 */
export function reconcileModulePorts(block: RtlBlock, next: ModuleDefinition): void {
  const previous = block.linkedModule;
  const sameLink = !!previous?.path && previous.path === next.path;
  const oldNameBySource = new Map(
    (sameLink ? previous.ports : []).map((port) => [port.sourceId, port.name]),
  );
  const nextSources = new Set(next.ports.map((port) => port.sourceId));

  const candidates = linkablePorts(block);
  const fixed = block.ports.filter((port) => !candidates.includes(port));
  const taken = new Set(fixed.map((port) => port.name));
  const claimed = new Set<RtlPort>();
  const kept: RtlPort[] = [];

  for (const definition of next.ports) {
    const free = candidates.filter((port) => !claimed.has(port));
    const port =
      free.find((p) => !!definition.sourceId && p.sourceId === definition.sourceId) ??
      free.find(
        (p) =>
          p.name === definition.name && (!p.sourceId || !nextSources.has(p.sourceId)),
      );

    if (port) {
      claimed.add(port);
      const renamedLocally =
        sameLink &&
        port.sourceId === definition.sourceId &&
        port.name !== oldNameBySource.get(definition.sourceId);
      port.name = claimName(renamedLocally ? port.name : definition.name, taken);
      const width = (definition.width ?? 1) > 1 ? definition.width : undefined;
      if (port.direction !== definition.direction || (port.width ?? 1) !== (width ?? 1)) {
        port.id = nanoid(6);
        port.direction = definition.direction;
        port.width = width;
        delete port.tiedOff;
      }
      port.sourceId = definition.sourceId;
      kept.push(port);
      continue;
    }

    const side = DEFAULT_SIDE[definition.direction];
    const onSide = block.ports.filter((p) => p.side === side).map((p) => p.slot);
    kept.push({
      id: nanoid(6),
      name: claimName(definition.name, taken),
      side,
      direction: definition.direction,
      // Provisional: the store's commit re-centres every side's ports.
      slot: onSide.length > 0 ? Math.max(...onSide) + 1 : 1,
      ...((definition.width ?? 1) > 1 ? { width: definition.width } : {}),
      sourceId: definition.sourceId,
    });
  }

  block.ports = [...fixed, ...kept];
  block.linkedModule = structuredClone(next);
  growToFitPorts(block);
}

/** Grid cells between the stacked I/O ports of a new module's schematic. */
const IO_ROW_CELLS = 6;

/** Grid column the outputs of a new module's schematic start in. */
const OUTPUT_COLUMN_CELLS = 32;

/**
 * A new schematic for "Create Module": one I/O component per port of the
 * module (named after it, as wide as it), inputs stacked down the left,
 * outputs down the right, inouts along the bottom — so linking the module
 * to it afterwards matches every port and keeps every wire. A sequential
 * module's clk and reset aren't interface ports (the parent's Mode toggle
 * owns them), but its schematic's registers need them, so it gets a clock
 * pin and a reset pin (IoRole) that the parent's clk/reset will feed.
 *
 * @param block - The module the schematic is for.
 * @param title - The new schematic's title.
 * @returns The schematic, ready to write.
 */
export function schematicForModule(block: RtlBlock, title: string): RtlDiagram {
  const diagram = createEmptyDiagram(title);
  const rows: Record<"left" | "right" | "bottom", number> = { left: 0, right: 0, bottom: 0 };
  const place = (
    name: string,
    direction: PortDirection,
    width: number | undefined,
    role?: IoRole,
  ) => {
    // An I/O pin is named from the design's side, the reverse of the
    // module port it stands for: a module input is a pin driving *out*.
    const pinDirection: PortDirection =
      direction === "in" ? "out" : direction === "out" ? "in" : "inout";
    const column = direction === "in" ? "left" : direction === "out" ? "right" : "bottom";
    const x =
      column === "left"
        ? 0
        : column === "right"
          ? OUTPUT_COLUMN_CELLS
          : (OUTPUT_COLUMN_CELLS / 2) + rows.bottom * 12;
    const y =
      column === "bottom"
        ? (Math.max(rows.left, rows.right) + 1) * IO_ROW_CELLS
        : rows[column] * IO_ROW_CELLS;
    rows[column] += 1;
    const io = createBlock("io", x * GRID_SIZE, y * GRID_SIZE);
    io.label = name;
    const pin = io.ports[0];
    pin.direction = pinDirection;
    pin.side = pinDirection === "in" ? "left" : "right";
    pin.width = (width ?? 1) > 1 ? width : undefined;
    if (role) {
      io.ioRole = role;
    }
    diagram.blocks.push(io);
  };

  if (block.ports.some(isClockPort)) {
    place("clk", "in", undefined, "clock");
    place("reset", "in", undefined, "reset");
  }
  for (const port of linkablePorts(block)) {
    place(port.name, port.direction, port.width);
  }
  return diagram;
}

/**
 * How many wires linking (or re-syncing) a module to an interface would
 * remove — for the warning shown before linking a schematic whose ports
 * don't match. Works on a copy; nothing is changed.
 *
 * @param diagram - The document the module is in.
 * @param blockId - The module.
 * @param next - The interface it would take.
 * @returns The number of wires that would be dropped.
 */
export function wiresDroppedByLink(
  diagram: RtlDiagram,
  blockId: string,
  next: ModuleDefinition,
): number {
  const block = diagram.blocks.find((b) => b.id === blockId);
  if (!block) {
    return 0;
  }
  const copy = structuredClone(block);
  reconcileModulePorts(copy, next);
  const surviving = new Set(copy.ports.map((port) => port.id));
  return diagram.wires.filter(
    (wire) =>
      (wire.sourceBlockId === blockId && !surviving.has(wire.sourcePortId)) ||
      (wire.targetBlockId === blockId && !surviving.has(wire.targetPortId)),
  ).length;
}
