/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { BlockKind } from "../../../shared/diagram-model";

/** One 16×16 line glyph per component kind. All draw in `currentColor`. */
const GLYPHS: Record<BlockKind, JSX.Element> = {
  // A chip: body plus pins on both sides.
  module: (
    <>
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M1 6h3M1 10h3M12 6h3M12 10h3" />
    </>
  ),
  // A D flip-flop: body with a clock-edge triangle on its lower-left.
  register: (
    <>
      <rect x="3.5" y="3" width="9" height="10" rx="1" />
      <path d="M3.5 8.5l2.2-1.6v3.2z" fill="currentColor" stroke="none" />
    </>
  ),
  // A top-level pin: an arrow leaving a boundary bar.
  io: (
    <>
      <path d="M3 2v12" />
      <path d="M6 8h7M10 4.5 13.5 8 10 11.5" />
    </>
  ),
  // A tie-off: a filled node feeding a short stub.
  constant: (
    <>
      <circle cx="5" cy="8" r="2.5" fill="currentColor" stroke="none" />
      <path d="M7.5 8h6" />
    </>
  ),
  // An AND gate: a flat-left, D-shaped body (two inputs feeding one output).
  gate: (
    <>
      <path d="M4 3h3a5 5 0 0 1 0 10H4z" />
      <path d="M1 6h3M1 10h3M12 8h3" />
    </>
  ),
  // A decoder: a narrow body with few inputs fanning out to many outputs.
  codec: (
    <>
      <rect x="4.5" y="2" width="7" height="12" rx="1" />
      <path d="M1.5 6.5h3M1.5 9.5h3M11.5 4h3M11.5 6.7h3M11.5 9.3h3M11.5 12h3" />
    </>
  ),
  // A multiplexer: the classic trapezoid, wide input face narrowing to one
  // output, with its select line entering the bottom.
  mux: (
    <>
      <path d="M4.5 2 11.5 5v6l-7 3z" />
      <path d="M1.5 5h3M1.5 11h3M11.5 8h3M8 12.5v2.5" />
    </>
  ),
};

/**
 * Render the palette glyph for a component kind.
 *
 * @param props.kind - Which component the icon represents.
 * @returns A 16×16 inline SVG that inherits color from its parent.
 */
export default function ComponentIcon({ kind }: { kind: BlockKind }) {
  return (
    <svg
      className="palette__icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[kind]}
    </svg>
  );
}
