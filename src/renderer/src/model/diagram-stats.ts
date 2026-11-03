/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { RtlDiagram } from "../../../shared/diagram-model";
import { GRID_SIZE } from "./grid";

/** Whole-diagram counts shown in the status bar (StatusBar.tsx). */
export interface DiagramStats {
  /** Every block on the canvas, of any kind. */
  components: number;
  /** Connections drawn between ports — one per wire on the canvas. */
  links: number;
  /** Physical signal wires: each link counts as its bus width (1 if plain). */
  wires: number;
  /** Ports, on any block, that no link touches and that aren't tied off. */
  emptyPorts: number;
  /** Grid squares covered by all blocks together. */
  area: number;
  /** Top-level input pins: I/O blocks whose pin drives into the design. */
  inputs: number;
  /** Top-level output pins: I/O blocks whose pin is driven by the design. */
  outputs: number;
}

/**
 * Tally a diagram for the status bar.
 *
 * @param diagram - The diagram to count.
 * @returns Its {@link DiagramStats}.
 */
export function computeDiagramStats(diagram: RtlDiagram): DiagramStats {
  const portWidth = new Map<string, number>();
  // A tied-off port is unconnected on purpose, so it isn't "empty".
  const tiedOff = new Set<string>();
  for (const block of diagram.blocks) {
    for (const port of block.ports) {
      portWidth.set(`${block.id}/${port.id}`, port.width ?? 1);
      if (port.tiedOff) {
        tiedOff.add(`${block.id}/${port.id}`);
      }
    }
  }

  const connected = new Set<string>();
  let wires = 0;
  for (const wire of diagram.wires) {
    const source = `${wire.sourceBlockId}/${wire.sourcePortId}`;
    connected.add(source);
    connected.add(`${wire.targetBlockId}/${wire.targetPortId}`);
    wires += portWidth.get(source) ?? 1;
  }

  // An I/O block's one pin is named from the design's side: a pin that
  // drives out ("out") feeds a signal *into* the design, so it's an input.
  const ioPins = diagram.blocks
    .filter((block) => block.kind === "io")
    .map((block) => block.ports[0]?.direction);

  return {
    components: diagram.blocks.length,
    links: diagram.wires.length,
    wires,
    emptyPorts: [...portWidth.keys()].filter(
      (key) => !connected.has(key) && !tiedOff.has(key),
    ).length,
    area: Math.round(
      diagram.blocks.reduce(
        (sum, block) => sum + block.width * block.height,
        0,
      ) /
        (GRID_SIZE * GRID_SIZE),
    ),
    inputs: ioPins.filter((direction) => direction === "out").length,
    outputs: ioPins.filter((direction) => direction === "in").length,
  };
}
