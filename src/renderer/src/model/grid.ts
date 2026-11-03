/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// The canvas grid. One spacing value feeds several things that must agree: the
// visible background lines, React Flow's drag snapping, and the snapping applied
// to programmatic block placement. Keeping it here stops them drifting apart.

/** Grid pitch in canvas units. Block sizes are always multiples of this. */
export const GRID_SIZE = 16;

/**
 * The base grid splits into this many parts when the viewer zooms in far enough
 * to work at sub-cell precision. Block positions are always multiples of the
 * resulting {@link FINE_GRID_SIZE}, so nothing lands off any grid line.
 */
export const SUBGRID_DIVISIONS = 2;

/** Finest snap pitch, offered only at high zoom. Must divide {@link GRID_SIZE}. */
export const FINE_GRID_SIZE = GRID_SIZE / SUBGRID_DIVISIONS;

/** Every Nth base line is promoted to a heavier "major" line. */
export const MAJOR_GRID_MULTIPLE = 8;

// A grid level fades by how far apart its lines currently sit *on screen*: at or
// below MIN it is invisible, at or above FULL it is drawn at full strength. The
// finer levels therefore dissolve before their lines are dense enough to grey
// out the canvas, and the next level up takes over.
const FADE_MIN_SCREEN_PX = 6;
const FADE_FULL_SCREEN_PX = 16;

// Below this on-screen spacing the fine grid is too cramped to aim at, so drag
// snapping stays on the base grid even though the lines are faintly visible.
const FINE_SNAP_MIN_SCREEN_PX = 11;

/**
 * Snap a single coordinate to the nearest grid line.
 *
 * @param value - A raw canvas coordinate.
 * @param pitch - Grid spacing to snap to; defaults to {@link GRID_SIZE}.
 * @returns The coordinate rounded to the nearest multiple of `pitch`.
 */
export function snapToGrid(value: number, pitch: number = GRID_SIZE): number {
  return Math.round(value / pitch) * pitch;
}

/**
 * The snap pitch to use for pointer-driven edits at the current zoom: the fine
 * grid once its lines are far enough apart on screen to aim at, the base grid
 * otherwise.
 *
 * @param zoom - Current viewport zoom (screen pixels per canvas unit).
 * @returns Either {@link FINE_GRID_SIZE} or {@link GRID_SIZE}.
 */
export function snapPitchForZoom(zoom: number): number {
  return FINE_GRID_SIZE * zoom >= FINE_SNAP_MIN_SCREEN_PX
    ? FINE_GRID_SIZE
    : GRID_SIZE;
}

/**
 * Opacity for one grid level at the current zoom, ramping linearly from 0 to 1
 * as its on-screen line spacing grows from {@link FADE_MIN_SCREEN_PX} to
 * {@link FADE_FULL_SCREEN_PX}.
 *
 * @param worldGap - Spacing between this level's lines in canvas units.
 * @param zoom - Current viewport zoom (screen pixels per canvas unit).
 * @returns Opacity in the range 0..1.
 */
export function gridLevelOpacity(worldGap: number, zoom: number): number {
  const screenGap = worldGap * zoom;
  const span = FADE_FULL_SCREEN_PX - FADE_MIN_SCREEN_PX;
  const t = (screenGap - FADE_MIN_SCREEN_PX) / span;
  return Math.min(1, Math.max(0, t));
}
