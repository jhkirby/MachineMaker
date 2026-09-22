/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Translates the persistent RTL model into the node/edge arrays React Flow
// renders, and back. The RTL model stays the source of truth; these are views.

import { Position, type Connection, type Edge, type Node } from "@xyflow/react";
import type {
  PortDirection,
  PortSide,
  RtlBlock,
  RtlDiagram,
  RtlWire,
} from "../../../shared/diagram-model";
import type { ArmedPort, Selection } from "../state/diagram-store";
import type { RoutedWire } from "./wire-router";

/** React Flow node backed by an {@link RtlBlock}. */
export type RtlBlockNode = Node<{ block: RtlBlock }, "rtlBlock">;

/** React Flow edge backed by an {@link RtlWire}, plus its routed polyline. */
export type RtlWireEdge = Edge<
  { wire: RtlWire; route?: RoutedWire; isBus: boolean },
  "rtlWire"
>;

/**
 * Map a port side to the React Flow handle position enum.
 *
 * @param side - The side the port sits on.
 * @returns The matching React Flow Position.
 */
export function sideToPosition(side: PortSide): Position {
  switch (side) {
    case "left":
      return Position.Left;
    case "right":
      return Position.Right;
    case "top":
      return Position.Top;
    case "bottom":
      return Position.Bottom;
    default:
      return Position.Left;
  }
}

/**
 * Whether two ports' directions allow a wire between them: an in/out pair
 * (either order), or an inout/inout pair — `"inout"` is bidirectional and
 * can only ever connect to another `"inout"`, never to a plain `"in"` or
 * `"out"`, so mixing an inout with either of those has no defined meaning
 * any more than wiring two outputs together would.
 *
 * @param a - One port's direction.
 * @param b - The other port's direction.
 * @returns True if the pair is a valid direction combination.
 */
export function directionsCompatible(
  a: PortDirection,
  b: PortDirection,
): boolean {
  if (a === "inout" || b === "inout") {
    return a === "inout" && b === "inout";
  }
  return a !== b;
}

/**
 * Resolve two clicked ports into a source→target connection for a
 * click-to-connect gesture, or null if the pair can't be wired together: the
 * directions must be compatible (see {@link directionsCompatible}) and both
 * ports the same bit width — wiring a bus to a narrower (or wider) port has
 * no defined meaning — and they can't be the same port.
 *
 * @param diagram - The diagram to look up both ports in.
 * @param a - One port clicked, in either order relative to `b`.
 * @param b - The other port clicked.
 * @returns The connection to create (`source` is the output port for an
 *   in/out pair; for an inout/inout pair, which end is which is arbitrary —
 *   it's whichever was clicked first), or null if the pair isn't a valid
 *   connection.
 */
export function resolvePortPairConnection(
  diagram: RtlDiagram,
  a: ArmedPort,
  b: ArmedPort,
): Connection | null {
  if (a.blockId === b.blockId && a.portId === b.portId) {
    return null;
  }
  const portOf = (ref: ArmedPort) =>
    diagram.blocks
      .find((block) => block.id === ref.blockId)
      ?.ports.find((p) => p.id === ref.portId);
  const portA = portOf(a);
  const portB = portOf(b);
  if (
    !portA ||
    !portB ||
    !directionsCompatible(portA.direction, portB.direction)
  ) {
    return null;
  }
  if ((portA.width ?? 1) !== (portB.width ?? 1)) {
    return null;
  }
  const [outRef, inRef] = portA.direction === "out" ? [a, b] : [b, a];
  return {
    source: outRef.blockId,
    sourceHandle: outRef.portId,
    target: inRef.blockId,
    targetHandle: inRef.portId,
  };
}

/**
 * Build the React Flow node array for a diagram.
 *
 * @param diagram - The diagram to project.
 * @param selection - Current selection, used to set each node's `selected` flag.
 * @returns One node per block.
 */
export function toFlowNodes(
  diagram: RtlDiagram,
  selection: Selection,
): RtlBlockNode[] {
  const selected = new Set(selection.blockIds);
  return diagram.blocks.map((block) => ({
    id: block.id,
    type: "rtlBlock",
    position: { x: block.x, y: block.y },
    data: { block },
    selected: selected.has(block.id),
    width: block.width,
    height: block.height,
    style: { width: block.width, height: block.height },
  }));
}

/**
 * Build the React Flow edge array for a diagram.
 *
 * @param diagram - The diagram to project.
 * @param selection - Current selection, used to set each edge's `selected` flag.
 * @param routes - Precomputed wire routes, keyed by wire id.
 * @returns One edge per wire.
 */
export function toFlowEdges(
  diagram: RtlDiagram,
  selection: Selection,
  routes: Map<string, RoutedWire>,
): RtlWireEdge[] {
  const selected = new Set(selection.wireIds);
  const blockById = new Map(diagram.blocks.map((b) => [b.id, b]));
  return diagram.wires.map((wire) => {
    const sourcePort = blockById
      .get(wire.sourceBlockId)
      ?.ports.find((p) => p.id === wire.sourcePortId);
    const isBus = (sourcePort?.width ?? 1) > 1;
    return {
      id: wire.id,
      type: "rtlWire",
      source: wire.sourceBlockId,
      target: wire.targetBlockId,
      sourceHandle: wire.sourcePortId,
      targetHandle: wire.targetPortId,
      data: { wire, route: routes.get(wire.id), isBus },
      selected: selected.has(wire.id),
    };
  });
}
