/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-20
 * --------------------------------------------------------------------------- */

// Renderer-only text metrics via an offscreen canvas — used to size a block
// so a port's label always has enough room, rather than guessing from a
// fixed per-character estimate that would drift from the actual font.

/** Font string matching .rtl-port__label in app.css: 9px, the app's UI font. */
const PORT_LABEL_FONT_SIZE = 9;

let measureCtx: CanvasRenderingContext2D | null | undefined;

/**
 * The shared measuring context, created once and reused. `undefined` means
 * "not tried yet"; `null` means creation failed (e.g. no canvas support) and
 * every call should fall back to the estimate below.
 *
 * @returns A 2D context, or null if none is available.
 */
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  return measureCtx;
}

/**
 * The app's UI font family, read from its own CSS custom property so this
 * stays in lockstep with tokens.css instead of hard-coding a copy of it.
 *
 * @returns The `--font-ui` value, or a plain sans-serif fallback.
 */
function uiFontFamily(): string {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-ui")
    .trim();
  return family || "sans-serif";
}

/**
 * Pixel width a port label would render at, matching `.rtl-port__label`'s
 * font exactly (same size is used for both the name and its bus-width
 * suffix, so one measurement of the full text is accurate).
 *
 * @param text - The label's full text, e.g. from `portLabelText`.
 * @returns The rendered width in px — a rough per-character estimate if no
 *   canvas context is available yet.
 */
export function measurePortLabelWidth(text: string): number {
  const ctx = getMeasureContext();
  if (!ctx) {
    return text.length * (PORT_LABEL_FONT_SIZE * 0.62);
  }
  ctx.font = `${PORT_LABEL_FONT_SIZE}px ${uiFontFamily()}`;
  return ctx.measureText(text).width;
}
