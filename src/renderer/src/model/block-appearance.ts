/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Single source of truth for block colors. Kept as literal hex (not CSS vars)
// so the SVG exporter produces a self-contained file that renders identically
// outside the app.

import type { BlockKind, RtlBlock } from "../../../shared/diagram-model";
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
    gate: MODULE_BLUE_DARK,
    codec: MODULE_BLUE_DARK,
    mux: MODULE_BLUE_DARK,
  },
  light: {
    module: MODULE_BLUE_LIGHT,
    register: MODULE_BLUE_LIGHT,
    io: MODULE_BLUE_LIGHT,
    constant: MODULE_BLUE_LIGHT,
    gate: MODULE_BLUE_LIGHT,
    codec: MODULE_BLUE_LIGHT,
    mux: MODULE_BLUE_LIGHT,
  },
};

/**
 * The small caption drawn under a block's name — its kind, or the more
 * specific thing it is where that's chosen per block (a gate's function, a
 * codec's direction). Shared by the canvas node and the SVG exporter so the
 * two always agree.
 *
 * @param block - The block to caption.
 * @returns e.g. "module", "XOR", "decoder", "mux".
 */
export function blockKindLabel(block: RtlBlock): string {
  switch (block.kind) {
    case "gate":
      return block.gateType ?? "AND";
    case "codec":
      return block.codecType ?? "decoder";
    case "io":
      return block.ioRole ?? "io";
    case "module":
      // A linked module is captioned with what it is: its schematic.
      return block.linkedModule?.path ? block.linkedModule.name : "module";
    default:
      return block.kind;
  }
}

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

/**
 * A wire's color in Simulate mode, from how many of its bits are 1:
 * grey when none are, fully lit when all are, and in between for a bus
 * partly lit (4 of 8 bits → halfway). "Lit" is white on the dark canvas;
 * on the light canvas, where white would vanish, it's near-black instead.
 */
const SIMULATED_WIRE_BY_THEME: Record<Theme, { off: string; on: string }> = {
  dark: { off: "#5d6475", on: "#ffffff" },
  light: { off: "#b4bac6", on: "#14171c" },
};

/**
 * Blend two `#rrggbb` colors.
 *
 * @param from - The color at t = 0.
 * @param to - The color at t = 1.
 * @param t - How far along, 0 to 1.
 * @returns The blended color.
 */
function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const channel = (i: number) =>
    Math.round(a[i] + (b[i] - a[i]) * Math.min(1, Math.max(0, t)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * A simulated wire's color for how lit it is (see activeFraction in
 * signal-values.ts).
 *
 * @param fraction - Share of its bits that are 1, or undefined if unknown.
 * @param theme - The app theme.
 * @returns The stroke color; an unknown value draws as unlit.
 */
export function simulatedWireColor(fraction: number | undefined, theme: Theme): string {
  const { off, on } = SIMULATED_WIRE_BY_THEME[theme];
  return mixHex(off, on, fraction ?? 0);
}

/**
 * Highlight color for a selected wire, per theme — plain white reads clearly
 * against this app's dark canvas but nearly disappears against the light
 * one, which gets a dark grey instead.
 */
const SELECTION_COLOR_BY_THEME: Record<Theme, string> = {
  dark: "#ffffff",
  light: "#3f434c",
};

/**
 * Resolve the selected-wire highlight color for a given theme.
 *
 * @param theme - Which theme's variant to use.
 * @returns The stroke/label color a selected wire renders with.
 */
export function selectionColorFor(theme: Theme): string {
  return SELECTION_COLOR_BY_THEME[theme];
}

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

// ── CUSTOM PER-BLOCK COLOR ───────────────────────────────────────────────────

/**
 * A wide, curated set of accent colors offered as one-click swatches in the
 * inspector's Color section (see ColorPicker.tsx) — the standard "500"
 * step of a well-known, broadly-licensed color ramp, chosen because every
 * entry is already tuned to be readable and distinct from its neighbors
 * rather than picked ad hoc. Exactly 17: with the leading "revert to
 * default" swatch, that's 18 circles total — two even rows of nine at this
 * panel's width, not two full rows plus a third with a single leftover.
 * Indigo was the one dropped, sitting close enough in hue to both blue and
 * violet (its neighbors here) that the set stays visually distinct without
 * it.
 */
export const COLOR_SWATCHES: readonly string[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#6b7280", // gray
];

/** Matches a `#rrggbb` hex color, case-insensitive. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Whether a string is a well-formed `#rrggbb` hex color.
 *
 * @param value - The candidate string, as typed into the hex input.
 * @returns True if it parses as exactly six hex digits after a `#`.
 */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * Parse a `#rrggbb` hex color into its 0-255 channel values.
 *
 * @param hex - A valid hex color (see {@link isValidHexColor}).
 * @returns The red, green, and blue channels.
 */
export function hexToRgb(hex: string): [r: number, g: number, b: number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Render a hex color as an `rgba()` string at a given opacity — used for the
 * translucent glow behind an armed/connectable port ring (see
 * `--block-stroke-glow` in RtlBlockNode.tsx), which needs the block's own
 * stroke color at reduced alpha rather than a second, unrelated color.
 *
 * @param hex - A valid `#rrggbb` color.
 * @param alpha - Opacity from 0 to 1.
 * @returns e.g. `"rgba(76, 159, 254, 0.35)"`.
 */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Format 0-255 channel values back into a `#rrggbb` hex color.
 *
 * @param channels - Red, green, and blue, each clamped to [0, 255].
 * @returns The hex color, lowercase.
 */
function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  const channel = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Blend a custom color toward a fixed base by a fraction — the same relationship
 * this file's own MODULE_BLUE_DARK/LIGHT fills already have to their stroke
 * (a block's fill has always been a muted, backgrounded version of its
 * accent, never the accent itself), reproduced here for an arbitrary color
 * instead of just the one built-in blue.
 *
 * @param hex - The custom color to blend in.
 * @param base - The surface color to blend toward, as 0-255 channels.
 * @param amount - How much of `hex` to mix in, from 0 (pure `base`) to 1
 *   (pure `hex`).
 * @returns The blended color as a hex string.
 */
function blend(
  hex: string,
  base: readonly [number, number, number],
  amount: number,
): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([
    base[0] + (r - base[0]) * amount,
    base[1] + (g - base[1]) * amount,
    base[2] + (b - base[2]) * amount,
  ]);
}

/** Canvas-black a dark-theme custom fill blends toward (see {@link blend}). */
const DARK_FILL_BASE: readonly [number, number, number] = [20, 22, 27];
/** White a light-theme custom fill blends toward (see {@link blend}). */
const LIGHT_FILL_BASE: readonly [number, number, number] = [255, 255, 255];

/**
 * Derive a full {@link BlockPalette} from one custom accent color — the same
 * fill-blend ratio MODULE_BLUE_DARK/LIGHT use relative to their own stroke,
 * applied to an arbitrary hex instead, so a custom color reads as "this
 * app's block style, in a different hue" rather than a color swapped in
 * with no relation to the rest of the palette. Text stays the theme's fixed
 * value (same as every built-in kind already shares) rather than computed
 * per-color: at these blend ratios the fill never gets light enough in dark
 * mode or dark enough in light mode to threaten that contrast.
 *
 * @param hex - A valid `#rrggbb` custom color.
 * @param theme - Which theme's fill-blend and text to use.
 * @returns The derived palette.
 */
function paletteFromColor(hex: string, theme: Theme): BlockPalette {
  const base = theme === "dark" ? DARK_FILL_BASE : LIGHT_FILL_BASE;
  const amount = theme === "dark" ? 0.25 : 0.15;
  return {
    fill: blend(hex, base, amount),
    stroke: hex,
    text: theme === "dark" ? MODULE_BLUE_DARK.text : MODULE_BLUE_LIGHT.text,
  };
}

/**
 * Resolve the palette a block actually renders with: its own custom color
 * (see {@link RtlBlock.color}) when it has one, otherwise its kind's
 * default (see {@link paletteFor}).
 *
 * @param block - The block to resolve colors for.
 * @param theme - Which theme's variant to use.
 * @returns The colors to render this specific block with.
 */
export function resolvePalette(block: RtlBlock, theme: Theme): BlockPalette {
  if (block.color && isValidHexColor(block.color)) {
    return paletteFromColor(block.color, theme);
  }
  return paletteFor(block.kind, theme);
}
