/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { RtlDiagram } from "../../../shared/diagram-model";
import { computeDiagramStats, type DiagramStats } from "./diagram-stats";

/** A zeroed {@link DiagramStats}, the identity for {@link sumDiagramStats}. */
const EMPTY_STATS: DiagramStats = {
  components: 0,
  links: 0,
  wires: 0,
  emptyPorts: 0,
  area: 0,
  inputs: 0,
  outputs: 0,
};

/**
 * Project-wide totals: every schematic's status-bar stats, summed field by
 * field — what the project page's stats panel shows.
 *
 * @param diagrams - The project's schematics.
 * @returns The summed stats (all zero for an empty project).
 */
export function sumDiagramStats(diagrams: readonly RtlDiagram[]): DiagramStats {
  return diagrams.map(computeDiagramStats).reduce<DiagramStats>(
    (total, stats) => {
      const sum = { ...total };
      for (const key of Object.keys(sum) as Array<keyof DiagramStats>) {
        sum[key] += stats[key];
      }
      return sum;
    },
    { ...EMPTY_STATS },
  );
}

/**
 * "3 days ago"-style wording for a past ISO timestamp, for recent-project
 * and schematic lists.
 *
 * @param iso - The timestamp.
 * @param now - The reference time (injected so it's testable).
 * @returns The relative phrase.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

/**
 * A calendar date for list popups, e.g. "Nov 2, 2026".
 *
 * @param iso - An ISO-8601 timestamp.
 * @returns The formatted date, or "—" if it's missing or unparseable.
 */
export function formatDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
