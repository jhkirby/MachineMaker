/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

/**
 * Orthogonal "PCB trace" routes, in a 1200×800 design space, that the home
 * page's backdrop draws — hand-placed to run in from the edges and stop
 * short of the centered hero, so the content stays clear of the busiest
 * lines. Each ends at a via (see {@link CircuitBackdrop}).
 */
const TRACES: readonly string[] = [
  "M0 120 H180 L220 160 H380",
  "M0 260 H120 L160 300 V420 L200 460 H300",
  "M0 640 H220 L260 600 H360",
  "M0 720 H90 L130 680 V560",
  "M140 0 V60 L180 100 H260 L300 140 V220",
  "M420 0 V70 L460 110 H520",
  "M1200 90 H1020 L980 130 H860",
  "M1200 300 H1080 L1040 340 V440 L1000 480 H920",
  "M1200 560 H1060 L1020 600 H840",
  "M1200 700 H1110 L1070 660 V560",
  "M1060 0 V80 L1020 120 H940 L900 160 V230",
  "M760 0 V60 L720 100 H660",
  "M300 800 V720 L340 680 H460",
  "M900 800 V740 L860 700 H740",
  "M600 800 V700",
];

/**
 * Where a trace ends, found by walking its M/L/H/V commands (an H or V moves
 * one axis only, so the last number alone isn't enough).
 *
 * @param path - One of {@link TRACES}.
 * @returns The final [x, y].
 */
function endPoint(path: string): [number, number] {
  const tokens = path.match(/[MLHV]|-?\d+(\.\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  let command = "M";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/[MLHV]/.test(token)) {
      command = token;
    } else if (command === "H") {
      x = Number(token);
    } else if (command === "V") {
      y = Number(token);
    } else {
      x = Number(token);
      y = Number(tokens[++i]);
    }
  }
  return [x, y];
}

/**
 * The home page's animated background: a faint board of circuit traces with
 * light pulses running along them toward their vias. Purely decorative and
 * hidden from assistive tech; the pulses stop under
 * `prefers-reduced-motion` (app.css).
 *
 * @returns The backdrop SVG.
 */
export default function CircuitBackdrop() {
  return (
    <svg
      className="circuit-backdrop"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="circuit-fade" cx="50%" cy="50%" r="60%">
          <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </radialGradient>
        {/* Fades the traces out toward the center, behind the hero. */}
        <mask id="circuit-mask">
          <rect width="1200" height="800" fill="url(#circuit-fade)" />
        </mask>
      </defs>
      <g mask="url(#circuit-mask)">
        {TRACES.map((d, index) => {
          const [x, y] = endPoint(d);
          return (
            <g key={d}>
              <path className="circuit-backdrop__trace" d={d} />
              <path
                className="circuit-backdrop__pulse"
                d={d}
                // Staggered so the pulses don't all fire in step.
                style={{ animationDelay: `${(index * 0.73) % 5}s` }}
              />
              <circle className="circuit-backdrop__via" cx={x} cy={y} r="5" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
