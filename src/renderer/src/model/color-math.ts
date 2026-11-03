/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Conversions between the color forms the color picker shows side by side —
// hex text, R/G/B fields, and the hue wheel + saturation/value square — so
// all three can stay in sync from whichever one the user just edited.

import { hexToRgb } from "./block-appearance";

/** A color as hue (0-360°), saturation (0-1), and value/brightness (0-1). */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * Format 0-255 channels as a lower-case `#rrggbb` hex color.
 *
 * @param r - Red channel, clamped and rounded into 0-255.
 * @param g - Green channel, clamped and rounded into 0-255.
 * @param b - Blue channel, clamped and rounded into 0-255.
 * @returns e.g. `"#5b8def"`.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Convert a hex color to HSV.
 *
 * @param hex - A valid `#rrggbb` color.
 * @returns Its hue/saturation/value. Hue is 0 for any grey, where it's
 *   undefined — callers that need to keep a hue across greys hold their own.
 */
export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * Convert HSV to a hex color.
 *
 * @param hsv - Hue in degrees (any value; wrapped into 0-360), saturation
 *   and value in 0-1.
 * @returns The matching `#rrggbb` color.
 */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const sector = Math.floor(hue / 60);
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector] ?? [0, 0, 0];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * The closest color the hue ring can produce — the ring only makes fully
 * saturated, full-brightness hues — to any color. The largest channel goes
 * to 255 and the smallest to 0, with the middle one scaled so the hue stays
 * the same: the nearest point on the ring, at the same angle. A grey has no
 * hue at all, so it goes to the ring's current hue instead.
 *
 * @param hex - Any `#rrggbb` color.
 * @param fallbackHue - The hue, in degrees, to use for a grey.
 * @returns The nearest `#rrggbb` color on the ring.
 */
export function snapToWheel(hex: string, fallbackHue: number): string {
  const { h, s, v } = hexToHsv(hex);
  const hueless = s === 0 || v === 0;
  return hsvToHex({ h: hueless ? fallbackHue : h, s: 1, v: 1 });
}
