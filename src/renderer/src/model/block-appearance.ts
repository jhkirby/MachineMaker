/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Single source of truth for block colors. Kept as literal hex (not CSS vars)
// so the SVG exporter produces a self-contained file that renders identically
// outside the app.

import type { BlockKind } from "../../../shared/diagram-model";
import type { Theme } from "../state/diagram-store";

/** Fill, border, and text colors for one block kind. */
export interface BlockPalette {
  fill: string;
  stroke: string;
  text: string;
}

// Every kind shares the "module" blue theme; the glyph and default port
// layout still distinguish the kinds. A block's fill is a deliberately dark
// navy in dark mode — but unchanged, that same navy reads as a jarring, too-
// dark hole against a light canvas, so light mode gets its own, much paler
// tint (and dark text to match, since the near-white dark-mode text would be
// unreadable on it) rather than sharing one palette across both themes.
const MODULE_BLUE_DARK: BlockPalette = {
  fill: "#28324a",
  stroke: "#5b8def",
  text: "#e8ecf4",
};

const MODULE_BLUE_LIGHT: BlockPalette = {
  fill: "#dde7fa",
  stroke: "#3865c9",
  text: "#1a2743",
};

const PALETTE_BY_THEME: Record<Theme, Record<BlockKind, BlockPalette>> = {
  dark: {
    module: MODULE_BLUE_DARK,
    register: MODULE_BLUE_DARK,
    io: MODULE_BLUE_DARK,
    constant: MODULE_BLUE_DARK,
  },
  light: {
    module: MODULE_BLUE_LIGHT,
    register: MODULE_BLUE_LIGHT,
    io: MODULE_BLUE_LIGHT,
    constant: MODULE_BLUE_LIGHT,
  },
};

/**
 * Shown instead of a block's normal colors while it is being dragged
 * somewhere it can't be dropped (overlapping another block or inside its
 * required clearance zone). See {@link collidesWithOtherBlocks} in
 * `model/collision.ts`.
 */
export const INVALID_PLACEMENT_PALETTE: BlockPalette = {
  fill: "#4a2426",
  stroke: "#e0655f",
  text: "#f6dede",
};

/** Color of a normal 1-bit wire. */
export const WIRE_COLOR = "#8b93a7";

/** Color of a bus (multi-bit) wire. */
export const BUS_COLOR = "#5b8def";

/** Highlight color for a selected wire. */
export const SELECTION_COLOR = "#ffffff";

/**
 * Resolve the palette for a block kind under a given theme.
 *
 * @param kind - The block kind.
 * @param theme - Which theme's variant to use. Defaults to dark (this app's
 *   original look) for the few callers — the palette's own stroke swatch in
 *   the left sidebar, mainly — that don't otherwise need to track the app's
 *   current theme.
 * @returns The colors to render that kind with.
 */
export function paletteFor(kind: BlockKind, theme: Theme = "dark"): BlockPalette {
  const palette = PALETTE_BY_THEME[theme];
  return palette[kind] ?? palette.module;
}
