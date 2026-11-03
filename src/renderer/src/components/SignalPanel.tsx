/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import { formatBusWidth } from "../../../shared/diagram-model";
import {
  isClockedElement,
  maxSignalValue,
  parseSignalValue,
  signalInputs,
  type SignalInput,
} from "../model/signal-values";
import { useDiagramStore } from "../state/diagram-store";
import { useSimulationStore } from "../state/simulation-store";

/**
 * One input's row: its name (and width) and a box for the value driven onto
 * it. The box accepts decimal or 0x/0b/0o numbers that fit the signal's
 * width, outlines itself red while the text doesn't, and drives the value
 * on Enter or when it loses focus (snapping back if it was invalid).
 *
 * @param props.input - The input.
 * @returns The row.
 */
function SignalRow({ input }: { input: SignalInput }) {
  // A value kept from an earlier run can be wider than the signal is now
  // (its width was cut in Build); only its low bits drive it.
  const value = useSimulationStore((s) => s.inputs.get(input.id) ?? 0n) & maxSignalValue(input.width);
  const setInput = useSimulationStore((s) => s.setInput);
  const [draft, setDraft] = useState(value.toString());

  useEffect(() => setDraft(value.toString()), [value]);

  const parsed = parseSignalValue(draft, input.width);
  const commit = () => {
    if (parsed === null) {
      setDraft(value.toString());
    } else if (parsed !== value) {
      setInput(input.id, parsed);
    }
  };

  const range = formatBusWidth(input.width);
  return (
    <li className="signal-row">
      <span className="signal-row__name" title={input.name}>
        {input.name}
        {range ? <em className="signal-row__width"> {range}</em> : null}
      </span>
      <input
        className={`signal-row__value${parsed === null ? " is-invalid" : ""}`}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-label={`${input.name} value`}
        title={`0 to ${maxSignalValue(input.width).toString()} — decimal, or 0x / 0b / 0o`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(value.toString());
            event.currentTarget.blur();
          }
        }}
      />
    </li>
  );
}

/**
 * The left panel's contents in Simulate mode: a search box over the
 * schematic's top-level inputs (clock and reset pins excluded), one row per
 * input to drive a value onto, and — when the schematic has anything
 * clocked (a register or a sequential module) — Reset and Clock buttons,
 * with the cycle count beneath.
 *
 * @returns The panel body.
 */
export default function SignalPanel() {
  const diagram = useDiagramStore((s) => s.diagram);
  const filePath = useDiagramStore((s) => s.filePath);
  const cycle = useSimulationStore((s) => s.cycles.get(filePath ?? "") ?? 0);
  const strobeClock = useSimulationStore((s) => s.strobeClock);
  const resetRegisters = useSimulationStore((s) => s.resetRegisters);
  const [query, setQuery] = useState("");

  const inputs = useMemo(() => signalInputs(diagram), [diagram]);
  const clocked = useMemo(() => diagram.blocks.some(isClockedElement), [diagram]);
  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return inputs.filter((input) =>
      words.every((word) => input.name.toLowerCase().includes(word)),
    );
  }, [inputs, query]);

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
          placeholder="Search inputs"
          aria-label="Search inputs"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {clocked ? (
        <div className="signal-panel__clock">
          <div className="signal-panel__clock-buttons">
            <button
              type="button"
              className="signal-panel__strobe"
              title="Advance every register and sequential module one clock edge"
              onClick={strobeClock}
            >
              Clock
            </button>
            <button
              type="button"
              className="signal-panel__reset"
              title="Reset every register to 0 (and the cycle count)"
              onClick={resetRegisters}
            >
              Reset
            </button>
          </div>
          <span className="signal-panel__cycle">Cycle {cycle}</span>
        </div>
      ) : null}

      {inputs.length === 0 ? (
        <p className="signal-panel__empty">This schematic has no inputs.</p>
      ) : visible.length === 0 ? (
        <p className="signal-panel__empty">No inputs match “{query}”.</p>
      ) : (
        <ul className="signal-panel__list" aria-label="Inputs">
          {visible.map((input) => (
            <SignalRow key={input.id} input={input} />
          ))}
        </ul>
      )}
    </div>
  );
}
