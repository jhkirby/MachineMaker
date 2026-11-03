/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Port rules for the "structured" kinds — codecs (encoder/decoder) and
// multiplexers — whose ports aren't added or removed by hand but follow
// entirely from a few settings on the block (type, size, data width). A
// diagram author can still rename and re-side each port; everything else
// (how many there are, which way they drive, how wide they are) is derived
// here, the one place it's decided.

import { nanoid } from "nanoid";
import {
  MAX_STRUCTURED_BITS,
  MIN_STRUCTURED_BITS,
  type CodecType,
  type PortDirection,
  type PortSide,
  type RtlBlock,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";

/** One run of interchangeable ports a structured block carries. */
interface PortGroup {
  /** Picks this group's ports out of the block's current port list. */
  matches: (port: RtlPort) => boolean;
  /** How many ports the group must hold. */
  count: number;
  direction: PortDirection;
  /** Bus width, or undefined for a plain 1-bit wire. */
  width: number | undefined;
  role: RtlPort["role"];
  /** Side a newly created port in this group starts on. */
  side: PortSide;
  /** Name for the group's `index`-th port when one has to be created. */
  name: (index: number) => string;
}

/** Defaults a fresh codec is stamped with (a 2-to-4 decoder). */
export const DEFAULT_CODEC_TYPE: CodecType = "decoder";
export const DEFAULT_CODEC_BITS = 2;

/** Defaults a fresh multiplexer is stamped with (a 1-bit 2:1 mux). */
export const DEFAULT_MUX_BITS = 1;
export const DEFAULT_MUX_DATA_WIDTH = 1;

/**
 * Whether a block kind's ports are derived from its settings rather than
 * edited one by one.
 *
 * @param kind - The block kind.
 * @returns True for codecs and multiplexers.
 */
export function isStructuredKind(kind: RtlBlock["kind"]): boolean {
  return kind === "codec" || kind === "mux";
}

/**
 * Clamp a size setting into the supported range, treating anything
 * unusable (missing, fractional, from a hand-edited file) as the minimum.
 *
 * @param bits - The raw setting.
 * @returns A whole number in [MIN_STRUCTURED_BITS, MAX_STRUCTURED_BITS].
 */
function clampBits(bits: number | undefined): number {
  if (bits === undefined || !Number.isFinite(bits)) {
    return MIN_STRUCTURED_BITS;
  }
  return Math.min(
    MAX_STRUCTURED_BITS,
    Math.max(MIN_STRUCTURED_BITS, Math.round(bits)),
  );
}

/**
 * The port groups a structured block must carry for its current settings.
 *
 * @param block - A codec or mux.
 * @returns Its groups in canonical order, or an empty list for any other
 *   kind.
 */
function groupsFor(block: RtlBlock): PortGroup[] {
  const bits = clampBits(block.bits);
  const wide = 2 ** bits;
  const isIn = (port: RtlPort) => port.direction === "in";
  const isOut = (port: RtlPort) => port.direction === "out";

  if (block.kind === "codec") {
    const decoder = (block.codecType ?? DEFAULT_CODEC_TYPE) === "decoder";
    return [
      {
        matches: isIn,
        count: decoder ? bits : wide,
        direction: "in",
        width: undefined,
        role: undefined,
        side: "left",
        name: (i) => (decoder ? `a${i}` : `d${i}`),
      },
      {
        matches: isOut,
        count: decoder ? wide : bits,
        direction: "out",
        width: undefined,
        role: undefined,
        side: "right",
        name: (i) => (decoder ? `y${i}` : `a${i}`),
      },
    ];
  }

  if (block.kind === "mux") {
    const width = (block.dataWidth ?? 1) > 1 ? block.dataWidth : undefined;
    return [
      {
        matches: (port) => isIn(port) && port.role !== "select",
        count: wide,
        direction: "in",
        width,
        role: undefined,
        side: "left",
        name: (i) => `d${i}`,
      },
      {
        matches: (port) => isIn(port) && port.role === "select",
        count: bits,
        direction: "in",
        width: undefined,
        role: "select",
        side: "bottom",
        name: (i) => `s${i}`,
      },
      {
        matches: isOut,
        count: 1,
        direction: "out",
        width,
        role: undefined,
        side: "right",
        name: () => "y",
      },
    ];
  }
  return [];
}

/**
 * A free name for a newly created port: the group's own default, or — if a
 * renamed sibling already wears it — that name with a numeric suffix.
 *
 * @param preferred - The group's default name for this position.
 * @param taken - Names already on the block; the result is added to it.
 * @returns A name no other port on the block has.
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
 * The slot after the highest one already used on a side — provisional only:
 * centerPortGroups (port-layout.ts) re-slots every side once the block's
 * size settles, so all this has to guarantee is no collision in between.
 *
 * @param ports - Ports placed so far.
 * @param side - The side a new port joins.
 * @returns A slot nothing on that side holds yet.
 */
function provisionalSlot(ports: readonly RtlPort[], side: PortSide): number {
  const used = ports.filter((port) => port.side === side).map((p) => p.slot);
  return used.length > 0 ? Math.max(...used) + 1 : 1;
}

/**
 * Bring a codec's or mux's ports in line with its settings: each group keeps
 * its existing ports (ids, names, sides — so wires and a diagram author's
 * edits survive) up to the count it needs, drops any beyond that, and gains
 * new default-named ports for any shortfall. Direction, width and role are
 * then forced on every port, since none of those are the author's to
 * choose. A no-op on every other kind.
 *
 * Also settles the block's own settings to valid values (size clamped,
 * codec type and data width defaulted) so a hand-edited file can't leave
 * them half-set.
 *
 * @param block - The block to conform; mutated in place.
 */
export function conformStructuredPorts(block: RtlBlock): void {
  if (!isStructuredKind(block.kind)) {
    return;
  }
  block.bits = clampBits(block.bits);
  if (block.kind === "codec") {
    block.codecType = block.codecType ?? DEFAULT_CODEC_TYPE;
  } else {
    block.dataWidth = Math.max(1, Math.round(block.dataWidth ?? 1));
  }

  const groups = groupsFor(block);
  const taken = new Set(block.ports.map((port) => port.name));
  const kept: RtlPort[] = [];
  const claimed = new Set<RtlPort>();
  for (const group of groups) {
    const existing = block.ports
      .filter((port) => !claimed.has(port) && group.matches(port))
      .slice(0, group.count);
    existing.forEach((port) => claimed.add(port));
    for (let index = 0; index < group.count; index++) {
      const port =
        existing[index] ??
        ({
          id: nanoid(6),
          name: claimName(group.name(index), taken),
          side: group.side,
          direction: group.direction,
          slot: provisionalSlot(kept, group.side),
        } satisfies RtlPort);
      port.direction = group.direction;
      port.width = group.width;
      if (group.role) {
        port.role = group.role;
      } else {
        delete port.role;
      }
      kept.push(port);
    }
  }
  block.ports = kept;
}

/**
 * Ids of the ports a settings change would remove from a structured block —
 * what the inspector checks against the wires before offering a smaller
 * size, since shrinking past a wired port would break that wire.
 *
 * @param block - The block as it is now (not mutated).
 * @param change - The settings it would change to.
 * @returns Ids of every port the change would drop.
 */
export function portsDroppedBy(
  block: RtlBlock,
  change: Partial<Pick<RtlBlock, "bits" | "codecType" | "dataWidth">>,
): string[] {
  const after = structuredClone(block);
  Object.assign(after, change);
  conformStructuredPorts(after);
  const surviving = new Set(after.ports.map((port) => port.id));
  return block.ports
    .filter((port) => !surviving.has(port.id))
    .map((port) => port.id);
}

/**
 * Whether any wire ends on one of the given ports of a block.
 *
 * @param wires - Every wire in the diagram.
 * @param blockId - The block the ports belong to.
 * @param portIds - The ports to check; every port of the block when
 *   omitted.
 * @returns True if at least one wire touches them.
 */
export function hasWiresOn(
  wires: readonly RtlWire[],
  blockId: string,
  portIds?: readonly string[],
): boolean {
  const wanted = portIds ? new Set(portIds) : null;
  return wires.some(
    (wire) =>
      (wire.sourceBlockId === blockId &&
        (!wanted || wanted.has(wire.sourcePortId))) ||
      (wire.targetBlockId === blockId &&
        (!wanted || wanted.has(wire.targetPortId))),
  );
}
