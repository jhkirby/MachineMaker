/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useMemo, type ReactNode } from "react";
import { useStore } from "@xyflow/react";
import { computeDiagramStats } from "../model/diagram-stats";
import { GRID_SIZE } from "../model/grid";
import {
  checkSchematic,
  checkSimulationReady,
  countUnlinkedModules,
} from "../model/schematic-validity";
import { useDiagramStore } from "../state/diagram-store";
import { linkedSchematic, useLinkedSchematics } from "../state/module-links";

/** One label/value readout; omitted from a group when `show` is false. */
interface Stat {
  label: string;
  value: ReactNode;
  title: string;
  show?: boolean;
}

/**
 * A run of related stats, separated from its neighbours by a divider.
 *
 * @param props.stats - The stats in display order; hidden ones are dropped.
 * @returns The group, or null when every stat in it is hidden.
 */
function StatGroup({ stats }: { stats: Stat[] }) {
  const visible = stats.filter((stat) => stat.show !== false);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className="status-bar__group">
      {visible.map((stat) => (
        <span key={stat.label} className="status-bar__stat" title={stat.title}>
          <span className="status-bar__label">{stat.label}:</span>
          <span className="status-bar__value">{stat.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A pass/fail readout at the right of the bar — "Valid Schematic:" or
 * "Simulation Ready:" — green with a check when it passes, red with an X
 * when it doesn't. Hovering it lists exactly what's failing.
 *
 * @param props.label - The readout's name, e.g. "Valid Schematic".
 * @param props.valid - Whether it passes.
 * @param props.problems - What's failing, for the tooltip.
 * @param props.passTitle - Tooltip while it passes.
 * @returns The indicator.
 */
function ValidityIndicator({
  label,
  valid,
  problems,
  passTitle,
}: {
  label: string;
  valid: boolean;
  problems: readonly string[];
  passTitle: string;
}) {
  return (
    <div
      className={`status-bar__validity ${valid ? "is-valid" : "is-invalid"}`}
      role="status"
      aria-label={`${label}: ${valid ? "yes" : "no"}`}
      title={valid ? passTitle : problems.join("\n")}
    >
      <span>{label}:</span>
      <svg
        viewBox="0 0 12 12"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {valid ? <path d="M2 6.5 5 9.5 10 3" /> : <path d="M3 3l6 6M9 3 3 9" />}
      </svg>
    </div>
  );
}

/**
 * Bottom status bar, in groups left to right: where the pointer is and the
 * zoom; how much of the diagram the canvas shows; the design's size; its
 * connectivity; and the current selection. Stats that don't apply right
 * now — no selection, no I/O pins, pointer off the canvas — are left out
 * rather than shown as zero. Pinned to the far right: whether the
 * schematic is valid and whether it's ready to simulate (see
 * schematic-validity.ts).
 *
 * @returns The status bar element.
 */
export default function StatusBar() {
  const diagram = useDiagramStore((s) => s.diagram);
  const selection = useDiagramStore((s) => s.selection);
  const pointer = useDiagramStore((s) => s.pointer);
  const zoom = useStore((s) => s.transform[2]);
  const canvasWidth = useStore((s) => s.width);
  const canvasHeight = useStore((s) => s.height);
  const stats = useMemo(() => computeDiagramStats(diagram), [diagram]);
  const linked = useLinkedSchematics((s) => s.byPath);
  const lookup = useMemo(
    () => (relative: string) => linkedSchematic(linked, relative),
    [linked],
  );
  const validity = useMemo(() => checkSchematic(diagram, lookup), [diagram, lookup]);
  const simulation = useMemo(
    () => checkSimulationReady(diagram, lookup),
    [diagram, lookup],
  );
  const unlinkedModules = useMemo(
    () => countUnlinkedModules(diagram, lookup),
    [diagram, lookup],
  );

  // How many grid squares fit across and down the visible canvas right now.
  const cellPx = GRID_SIZE * zoom;
  const viewCols = Math.round(canvasWidth / cellPx);
  const viewRows = Math.round(canvasHeight / cellPx);

  const groups: Stat[][] = [
    [
      {
        label: "Cursor",
        value: pointer ? `${pointer.screen.x} × ${pointer.screen.y}` : null,
        title: "Pointer position in the canvas, in screen pixels from its top-left",
        show: pointer !== null,
      },
      {
        label: "Cell",
        value: pointer ? `${pointer.cell.x} × ${pointer.cell.y}` : null,
        title: "Diagram grid square under the pointer",
        show: pointer !== null,
      },
      { label: "Zoom", value: `${Math.round(zoom * 100)}%`, title: "Canvas zoom level" },
    ],
    [
      {
        label: "Viewport",
        value: `${viewCols} × ${viewRows}`,
        title: "Grid squares visible across × down",
      },
      {
        label: "Viewport Area",
        value: viewCols * viewRows,
        title: "Grid squares visible in the whole canvas",
      },
    ],
    [
      {
        label: "Components",
        value: stats.components,
        title: "Components of every kind in the diagram",
      },
      { label: "Area", value: stats.area, title: "Grid squares covered by components" },
      {
        label: "Unlinked Modules",
        value: unlinkedModules,
        title: "Modules not linked to a schematic (or whose schematic is missing) — needed to simulate",
      },
      {
        label: "Signals",
        value: `${stats.inputs} in → ${stats.outputs} out`,
        title: "Top-level input pins → output pins",
        show: stats.inputs + stats.outputs > 0,
      },
    ],
    [
      { label: "Links", value: stats.links, title: "Connections between ports" },
      {
        label: "Wires",
        value: stats.wires,
        title: "Physical wires, counting each bit of a bus",
      },
      {
        label: "Empty Ports",
        value: stats.emptyPorts,
        title: "Ports with nothing connected",
      },
    ],
    [
      {
        label: "Selected Components",
        value: selection.blockIds.length,
        title: "Components currently selected",
        show: selection.blockIds.length > 0,
      },
      {
        label: "Selected Wires",
        value: selection.wireIds.length,
        title: "Wires currently selected",
        show: selection.wireIds.length > 0,
      },
    ],
  ];

  return (
    <footer className="status-bar">
      {groups.map((group, index) => (
        <StatGroup key={index} stats={group} />
      ))}
      <div className="status-bar__indicators">
        <ValidityIndicator
          label="Valid Schematic"
          {...validity}
          passTitle="Every port is wired or tied off, with an input and real logic"
        />
        <ValidityIndicator
          label="Simulation Ready"
          {...simulation}
          passTitle="Valid, and every module is linked"
        />
      </div>
    </footer>
  );
}
