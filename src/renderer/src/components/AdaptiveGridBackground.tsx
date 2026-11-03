/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import type { CSSProperties } from "react";
import { useStore } from "@xyflow/react";
import {
  FINE_GRID_SIZE,
  GRID_SIZE,
  MAJOR_GRID_MULTIPLE,
  gridLevelOpacity,
} from "../model/grid";

// Line colour, keyed off the theme's --text-muted (rgb 140,147,161 lightened a
// touch) so the grid reads on the near-black canvas without competing with the
// blocks. Each level carries its own alpha so that where all three coincide the
// hierarchy stays legible.
const LINE_RGB = "140, 147, 161";
const FINE_ALPHA = 0.24;
const MINOR_ALPHA = 0.38;
const MAJOR_ALPHA = 0.55;

const CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  zIndex: -1,
  pointerEvents: "none",
};

/**
 * Build the `d` for every grid line inside one major tile at the given step,
 * skipping the tile origin (which the coarser level already draws).
 *
 * @param tile - Major tile size in screen pixels.
 * @param step - Spacing between this level's lines in screen pixels.
 * @returns An SVG path string of vertical + horizontal segments.
 */
function tileLines(tile: number, step: number): string {
  let d = "";
  for (let pos = step; pos < tile - 0.5; pos += step) {
    d += `M${pos} 0V${tile}M0 ${pos}H${tile}`;
  }
  return d;
}

/**
 * Level-of-detail canvas grid drawn as a single tiled SVG pattern (one major
 * cell wide) that carries the fine, base, and major lines together. Rendering
 * one pattern instead of three stacked React Flow `<Background>` layers avoids a
 * Chromium quirk where stacked `userSpaceOnUse` patterns suppress one another.
 *
 * Each level's opacity tracks its on-screen spacing, so the fine grid only
 * resolves once the viewer zooms in — which is also when block snapping tightens
 * onto it (see `snapPitchForZoom` in the grid model).
 *
 * @returns The absolutely-positioned background SVG.
 */
export default function AdaptiveGridBackground() {
  const [tx, ty, zoom] = useStore((s) => s.transform);

  const majorGap = GRID_SIZE * MAJOR_GRID_MULTIPLE;
  const tile = majorGap * zoom;
  const fineStep = FINE_GRID_SIZE * zoom;
  const minorStep = GRID_SIZE * zoom;

  // Anchor the pattern so a major line passes through the world origin; the
  // modulo keeps the offset positive for left/upward pans.
  const offsetX = ((tx % tile) + tile) % tile;
  const offsetY = ((ty % tile) + tile) % tile;

  const fineOpacity = gridLevelOpacity(FINE_GRID_SIZE, zoom);
  const minorOpacity = gridLevelOpacity(GRID_SIZE, zoom);
  const majorOpacity = gridLevelOpacity(majorGap, zoom);

  return (
    <svg className="react-flow__background" style={CONTAINER_STYLE}>
      <pattern
        id="rtl-grid"
        x={offsetX}
        y={offsetY}
        width={tile}
        height={tile}
        patternUnits="userSpaceOnUse"
      >
        {fineOpacity > 0 ? (
          <path
            d={tileLines(tile, fineStep)}
            fill="none"
            stroke={`rgba(${LINE_RGB}, ${FINE_ALPHA})`}
            strokeWidth={1}
            style={{ opacity: fineOpacity }}
          />
        ) : null}
        {minorOpacity > 0 ? (
          <path
            d={tileLines(tile, minorStep)}
            fill="none"
            stroke={`rgba(${LINE_RGB}, ${MINOR_ALPHA})`}
            strokeWidth={1}
            style={{ opacity: minorOpacity }}
          />
        ) : null}
        <path
          d={`M0 0V${tile}M0 0H${tile}`}
          fill="none"
          stroke={`rgba(${LINE_RGB}, ${MAJOR_ALPHA})`}
          strokeWidth={1}
          style={{ opacity: majorOpacity }}
        />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#rtl-grid)" />
    </svg>
  );
}
