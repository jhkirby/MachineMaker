/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { EditorMode } from "../state/diagram-store";
import { useDiagramStore } from "../state/diagram-store";
import {
  toggleEditorMode,
  useSimulationReadiness,
} from "../state/simulation-readiness";

/** The two modes, in the order the toggle shows them. */
const MODES: readonly { value: EditorMode; label: string }[] = [
  { value: "build", label: "Build" },
  { value: "simulate", label: "Simulate" },
];

/** The keyboard chord that flips the mode (use-keyboard-shortcuts.ts). */
const SHORTCUT = "Ctrl+B";

/**
 * The toolbar's Build / Simulate switch — the same two-segment look as the
 * inspector's Combinational / Sequential toggle. Simulate makes the
 * document read-only (see EditorMode in diagram-store.ts), and is only
 * offered once the schematic is simulation-ready (the status bar's
 * Simulation Ready indicator is green); until then that segment is
 * disabled, its tooltip saying why. Tooltips name the shortcut.
 *
 * @returns The toggle.
 */
export default function EditorModeToggle() {
  const mode = useDiagramStore((s) => s.mode);
  const readiness = useSimulationReadiness();

  const titleFor = (value: EditorMode, label: string): string => {
    if (mode === value) {
      return `${label} mode — ${SHORTCUT} to switch`;
    }
    if (value === "simulate" && !readiness.valid) {
      return `Not ready to simulate:\n${readiness.problems.join("\n")}`;
    }
    return `Switch to ${label} (${SHORTCUT})`;
  };

  return (
    <div
      className="mode-toggle mode-toggle--toolbar"
      role="group"
      aria-label="Build or simulate"
    >
      {MODES.map(({ value, label }) => {
        // aria-disabled rather than disabled: a disabled button gets no
        // hover in Chromium, and its tooltip is what says why it's off.
        // toggleEditorMode refuses the switch regardless.
        const unavailable = value === "simulate" && mode === "build" && !readiness.valid;
        return (
        <button
          key={value}
          type="button"
          className={`mode-toggle__option${mode === value ? " is-active" : ""}${
            unavailable ? " is-unavailable" : ""
          }`}
          aria-pressed={mode === value}
          aria-disabled={unavailable}
          title={titleFor(value, label)}
          onClick={() => {
            if (mode !== value) {
              toggleEditorMode();
            }
          }}
        >
          {label}
        </button>
        );
      })}
    </div>
  );
}
