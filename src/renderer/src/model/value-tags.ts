/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Where Simulate mode's value tags (the small boxes beside each port's
// bubble) sit, and which ones to leave out because they'd overlap another —
// two ports facing each other across a short wire carry the same value, so
// showing it once is enough.

import type { RtlBlock, RtlDiagram, RtlPort } from "../../../shared/diagram-model";
import { portPosition } from "./port-geometry";
import { formatSignalValue } from "./signal-values";
import type { SignalValue } from "./simulator";

/** Gap, in px, between a port's bubble and its tag. */
export const VALUE_TAG_GAP = 7;

/** Approximate advance of one 9px monospace character, in px. */
const CHAR_WIDTH = 5.5;

/** Horizontal padding plus border of a tag, in px. */
const TAG_CHROME_X = 10;

/** Height of a tag, in px (9px text at 1.2 line height, plus padding/border). */
const TAG_HEIGHT = 15;

/** An axis-aligned box in canvas coordinates. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The canvas-space box a port's value tag occupies: just outside the block
 * beside the bubble, on the side away from the block (see the tag's CSS
 * placement, RtlBlockNode.tsx, which uses the same gap).
 *
 * @param block - The owning block.
 * @param port - The port.
 * @param text - The tag's text, for its width.
 * @returns The tag's box.
 */
function tagRect(block: RtlBlock, port: RtlPort, text: string): Rect {
  const at = portPosition(block, port);
  const width = text.length * CHAR_WIDTH + TAG_CHROME_X;
  switch (port.side) {
    case "left":
      return {
        left: at.x - VALUE_TAG_GAP - width,
        right: at.x - VALUE_TAG_GAP,
        top: at.y - TAG_HEIGHT / 2,
        bottom: at.y + TAG_HEIGHT / 2,
      };
    case "right":
      return {
        left: at.x + VALUE_TAG_GAP,
        right: at.x + VALUE_TAG_GAP + width,
        top: at.y - TAG_HEIGHT / 2,
        bottom: at.y + TAG_HEIGHT / 2,
      };
    case "top":
      return {
        left: at.x - width / 2,
        right: at.x + width / 2,
        top: at.y - VALUE_TAG_GAP - TAG_HEIGHT,
        bottom: at.y - VALUE_TAG_GAP,
      };
    case "bottom":
      return {
        left: at.x - width / 2,
        right: at.x + width / 2,
        top: at.y + VALUE_TAG_GAP,
        bottom: at.y + VALUE_TAG_GAP + TAG_HEIGHT,
      };
  }
}

/**
 * Whether two boxes overlap.
 *
 * @param a - One box.
 * @param b - The other.
 * @returns True if they share any area.
 */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The value tags to leave out so none overlap: tags are kept in the
 * schematic's block order, and any tag that would overlap one already kept
 * is dropped. Tied-off ports have no tag at all.
 *
 * @param diagram - The schematic.
 * @param values - Every port's simulated value, keyed `${blockId}/${portId}`.
 * @returns Keys (`${blockId}/${portId}`) of the tags to hide.
 */
export function hiddenValueTags(
  diagram: RtlDiagram,
  values: ReadonlyMap<string, SignalValue>,
): Set<string> {
  const kept: Rect[] = [];
  const hidden = new Set<string>();
  for (const block of diagram.blocks) {
    for (const port of block.ports) {
      if (port.tiedOff) {
        continue;
      }
      const key = `${block.id}/${port.id}`;
      const rect = tagRect(block, port, formatSignalValue(values.get(key)));
      if (kept.some((other) => overlaps(rect, other))) {
        hidden.add(key);
      } else {
        kept.push(rect);
      }
    }
  }
  return hidden;
}
