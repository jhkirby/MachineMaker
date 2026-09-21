/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Synthetic `.rtlproj` documents used as open-dialog fixtures. They are written
// against the on-disk contract in src/shared/diagram-model.ts, not against what
// the editor happens to produce, so a schema drift shows up as a failing test.

import {
  DIAGRAM_SCHEMA_VERSION,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
} from "../../src/shared/diagram-model";

/** Grid pitch the model rounds every coordinate and size to. */
export const GRID = 16;

/**
 * Build one port.
 *
 * @param id - Port id, unique within its block.
 * @param name - Displayed port name.
 * @param side - Block edge the port sits on.
 * @param direction - Signal direction relative to the block.
 * @param slot - 1-based grid cell along that edge.
 * @param width - Bus width in bits; omit for a 1-bit wire.
 * @returns The port.
 */
function port(
  id: string,
  name: string,
  side: RtlPort["side"],
  direction: RtlPort["direction"],
  slot: number,
  width?: number,
): RtlPort {
  return width === undefined
    ? { id, name, side, direction, slot }
    : { id, name, side, direction, slot, width };
}

/**
 * Build one block sized in whole grid cells.
 *
 * @param id - Block id, unique within the diagram.
 * @param label - Displayed block name.
 * @param kind - Visual/semantic family driving styling and defaults.
 * @param x - Left edge in canvas units.
 * @param y - Top edge in canvas units.
 * @param ports - The block's ports.
 * @returns The block, 12x8 cells.
 */
function block(
  id: string,
  label: string,
  kind: RtlBlock["kind"],
  x: number,
  y: number,
  ports: RtlPort[],
): RtlBlock {
  return { id, label, kind, x, y, width: 12 * GRID, height: 8 * GRID, ports };
}

// ── FIXTURE DOCUMENTS ───────────────────────────────────────────────────────

/**
 * A small, ordinary diagram: two blocks joined by one 32-bit bus.
 *
 * @returns A fresh copy, safe for a test to mutate.
 */
export function twoBlockDiagram(): RtlDiagram {
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    title: "Fetch Stage",
    blocks: [
      block("blk-alu", "ALU Core", "module", 0, 0, [
        port("p-clk", "clk", "left", "in", 2),
        port("p-a", "a", "left", "in", 4, 32),
        port("p-y", "y", "right", "out", 4, 32),
      ]),
      block("blk-reg", "Pipe Reg", "register", 20 * GRID, 0, [
        port("p-d", "d", "left", "in", 4, 32),
        port("p-q", "q", "right", "out", 4, 32),
      ]),
    ],
    wires: [
      {
        id: "wire-y-d",
        sourceBlockId: "blk-alu",
        sourcePortId: "p-y",
        targetBlockId: "blk-reg",
        targetPortId: "p-d",
        label: "[31:0]",
      },
    ],
  };
}

/**
 * A diagram at realistic working volume — a 4x6 grid of blocks chained by a
 * wire each — for asserting the canvas renders more than a toy document.
 *
 * @param columns - Blocks per row.
 * @param rows - Number of rows.
 * @returns The generated diagram.
 */
export function gridDiagram(columns = 4, rows = 6): RtlDiagram {
  const blocks: RtlBlock[] = [];
  const wires: RtlDiagram["wires"] = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    blocks.push(
      block(`blk-${index}`, `Stage ${index + 1}`, "module", column * 20 * GRID, row * 14 * GRID, [
        port(`p-${index}-in`, "din", "left", "in", 4, 16),
        port(`p-${index}-out`, "dout", "right", "out", 4, 16),
      ]),
    );
    if (index > 0) {
      wires.push({
        id: `wire-${index}`,
        sourceBlockId: `blk-${index - 1}`,
        sourcePortId: `p-${index - 1}-out`,
        targetBlockId: `blk-${index}`,
        targetPortId: `p-${index}-in`,
        label: "[15:0]",
      });
    }
  }

  return { schemaVersion: DIAGRAM_SCHEMA_VERSION, title: "Long Pipeline", blocks, wires };
}

/**
 * A document carrying values the in-app name fields would never let a user
 * type: markup, a path-traversal title, control characters, and an
 * out-of-range bus width. A `.rtlproj` is hand-editable JSON, so every one of
 * these is reachable in practice.
 *
 * @returns The hostile diagram.
 */
export function hostileDiagram(): RtlDiagram {
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    title: "../../../etc/passwd",
    blocks: [
      block("blk-xss", '<img src=x onerror="globalThis.__pwned = true">', "module", 0, 0, [
        port("p-script", "</span><script>globalThis.__portPwned=1</script>", "left", "in", 2),
        port("p-wide", "wide", "right", "out", 4, 999_999),
      ]),
    ],
    wires: [],
  };
}

/** Raw file bodies that must be rejected rather than half-loaded. */
export const MALFORMED_FILES: Record<string, string> = {
  "not-json.rtlproj": "{ this is not json ",
  "missing-arrays.rtlproj": JSON.stringify({ schemaVersion: 3, title: "Broken" }),
  "wrong-types.rtlproj": JSON.stringify({ title: 5, blocks: "nope", wires: null }),
  "empty.rtlproj": "",
};
