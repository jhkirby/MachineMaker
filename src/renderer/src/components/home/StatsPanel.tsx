/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { DiagramStats } from "../../model/diagram-stats";

/** Props for {@link StatsPanel}. */
interface StatsPanelProps {
  /** Small caps label above the grid, e.g. "Project totals". */
  heading: string;
  /** Larger name under the label, e.g. the project or schematic name. */
  name: string;
  stats: DiagramStats;
  /** Extra leading tiles (e.g. a schematic count), shown first. */
  extra?: Array<{ label: string; value: number | string }>;
}

/**
 * A card of stat tiles — the same counts the editor's status bar shows,
 * for a whole project (summed) or one schematic.
 *
 * @param props - See {@link StatsPanelProps}.
 * @returns The stats card.
 */
export default function StatsPanel({ heading, name, stats, extra = [] }: StatsPanelProps) {
  const tiles: Array<{ label: string; value: number | string }> = [
    ...extra,
    { label: "Components", value: stats.components },
    { label: "Area", value: stats.area },
    { label: "Links", value: stats.links },
    { label: "Wires", value: stats.wires },
    { label: "Empty Ports", value: stats.emptyPorts },
    { label: "Signals", value: `${stats.inputs} → ${stats.outputs}` },
  ];
  return (
    <section className="home-card stats-panel" aria-label={`${heading}: ${name}`}>
      <p className="home-card__eyebrow">{heading}</p>
      <h3 className="stats-panel__name" title={name}>
        {name}
      </h3>
      <dl className="stats-panel__grid">
        {tiles.map((tile) => (
          <div key={tile.label} className="stats-panel__tile">
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
