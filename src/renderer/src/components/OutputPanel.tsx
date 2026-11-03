/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useMemo, useState } from "react";
import { formatBusWidth } from "../../../shared/diagram-model";
import {
  describeSignalValue,
  formatSignalValue,
  signalOutputs,
} from "../model/signal-values";
import { useDiagramStore } from "../state/diagram-store";
import { useSimulationStore } from "../state/simulation-store";

/**
 * The right sidebar's top section in Simulate mode: the schematic's
 * top-level outputs, each with the value the simulation settles on it, under
 * a search box that filters them by name (the same way the Signals panel
 * filters inputs). Hovering a value shows it in hex and binary too.
 *
 * @returns The outputs section.
 */
export default function OutputPanel() {
  const diagram = useDiagramStore((s) => s.diagram);
  const ports = useSimulationStore((s) => s.ports);
  const [query, setQuery] = useState("");

  const outputs = useMemo(() => signalOutputs(diagram), [diagram]);
  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return outputs.filter((output) =>
      words.every((word) => output.name.toLowerCase().includes(word)),
    );
  }, [outputs, query]);

  return (
    <div className="signal-panel">
      <div className="signal-panel__search">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="signal-panel__search-input"
          value={query}
          placeholder="Search outputs"
          aria-label="Search outputs"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {outputs.length === 0 ? (
        <p className="signal-panel__empty">This schematic has no outputs.</p>
      ) : visible.length === 0 ? (
        <p className="signal-panel__empty">No outputs match “{query}”.</p>
      ) : (
        <ul className="signal-panel__list" aria-label="Outputs">
          {visible.map((output) => {
            const value = ports.get(output.portKey);
            const range = formatBusWidth(output.width);
            return (
              <li key={output.id} className="signal-row">
                <span className="signal-row__name" title={output.name}>
                  {output.name}
                  {range ? <em className="signal-row__width"> {range}</em> : null}
                </span>
                <output
                  className={`signal-row__readout${value === undefined ? " is-unknown" : ""}`}
                  aria-label={`${output.name} value`}
                  title={describeSignalValue(value, output.width)}
                >
                  {formatSignalValue(value)}
                </output>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
