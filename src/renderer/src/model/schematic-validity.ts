/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Whether a schematic is "complete", and whether it can be simulated — what
// the status bar's Valid Schematic and Simulation Ready indicators
// (StatusBar.tsx) report. Pure, so they can be checked anywhere.

import { isClockPort, type RtlDiagram } from "../../../shared/diagram-model";
import { hasRegisteredElement, isLinkedModule } from "../../../shared/module-interface";

/**
 * Looks up a linked schematic by its project-relative path: the schematic,
 * null when its file is missing, or undefined when it isn't loaded yet.
 */
export type LinkedSchematicLookup = (relative: string) => RtlDiagram | null | undefined;

/** The outcome of {@link checkSchematic}. */
export interface SchematicValidity {
  valid: boolean;
  /** One plain sentence per rule the schematic breaks; empty when valid. */
  problems: string[];
}

/**
 * Check a schematic against the rules of a complete design:
 *
 * 1. it has at least one real component — anything but an I/O port or a
 *    constant, which only feed or tap the design;
 * 2. every port is either wired or deliberately tied off
 *    (RtlPort.tiedOff), so nothing is left dangling by accident;
 * 3. it has at least one input — an I/O pin driving into the design;
 * 4. every sequential module linked to a schematic links to one with
 *    something to clock — a register or a nested sequential module.
 *
 * @param diagram - The schematic to check.
 * @param lookup - Finds linked schematics, for rule 4. A schematic not yet
 *   loaded (or none given) passes rule 4 until it is.
 * @returns Whether it's valid, and why not if it isn't.
 */
export function checkSchematic(
  diagram: RtlDiagram,
  lookup: LinkedSchematicLookup = () => undefined,
): SchematicValidity {
  const problems: string[] = [];

  const logic = diagram.blocks.filter(
    (block) => block.kind !== "io" && block.kind !== "constant",
  );
  if (logic.length < 1) {
    problems.push(
      "Needs at least one component besides I/O ports and constants.",
    );
  }

  const wired = new Set<string>();
  for (const wire of diagram.wires) {
    wired.add(`${wire.sourceBlockId}/${wire.sourcePortId}`);
    wired.add(`${wire.targetBlockId}/${wire.targetPortId}`);
  }
  const dangling = diagram.blocks.reduce(
    (count, block) =>
      count +
      block.ports.filter(
        (port) => !port.tiedOff && !wired.has(`${block.id}/${port.id}`),
      ).length,
    0,
  );
  if (dangling > 0) {
    problems.push(
      `${dangling} port${dangling === 1 ? " is" : "s are"} neither wired nor tied off.`,
    );
  }

  // An I/O pin is named from the design's side: one that drives "out" of
  // its block feeds a signal into the design — an input. A bidirectional
  // (inout) pin can feed it too, so it counts as well.
  const hasInput = diagram.blocks.some(
    (block) =>
      block.kind === "io" &&
      (block.ports[0]?.direction === "out" ||
        block.ports[0]?.direction === "inout"),
  );
  if (!hasInput) {
    problems.push("Needs at least one input I/O port.");
  }

  for (const block of diagram.blocks) {
    if (!isLinkedModule(block) || !block.ports.some(isClockPort)) {
      continue;
    }
    const child = lookup(block.linkedModule!.path!);
    if (child && !hasRegisteredElement(child)) {
      problems.push(
        `${block.label} is sequential, but ${child.title} has no register or sequential module to clock.`,
      );
    }
  }

  return { valid: problems.length === 0, problems };
}

/**
 * How many module blocks aren't linked to a schematic — boxes whose insides
 * nothing describes yet. A link whose schematic file is gone counts too.
 *
 * @param diagram - The schematic to count.
 * @param lookup - Finds linked schematics, to spot missing ones.
 * @returns The number of unlinked modules.
 */
export function countUnlinkedModules(
  diagram: RtlDiagram,
  lookup: LinkedSchematicLookup = () => undefined,
): number {
  return diagram.blocks.filter(
    (block) =>
      block.kind === "module" &&
      (!isLinkedModule(block) || lookup(block.linkedModule!.path!) === null),
  ).length;
}

/**
 * Whether a schematic can be simulated: it must be valid
 * ({@link checkSchematic}), and every module must be linked — a simulator
 * can't guess what an unlinked module does inside.
 *
 * @param diagram - The schematic to check.
 * @returns Whether it's ready, and why not if it isn't.
 */
export function checkSimulationReady(
  diagram: RtlDiagram,
  lookup: LinkedSchematicLookup = () => undefined,
): SchematicValidity {
  const problems = checkSchematic(diagram, lookup).valid
    ? []
    : ["The schematic isn't valid yet (see Valid Schematic)."];
  const unlinked = countUnlinkedModules(diagram, lookup);
  if (unlinked > 0) {
    problems.push(
      `${unlinked} module${unlinked === 1 ? " isn't" : "s aren't"} linked, so there's nothing to simulate inside ${unlinked === 1 ? "it" : "them"}.`,
    );
  }
  return { valid: problems.length === 0, problems };
}
