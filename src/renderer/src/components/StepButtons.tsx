/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

/**
 * The − and + buttons flanking a number field — the app's own stand-in for
 * Chromium's native spin buttons, which can't be themed and are hidden
 * globally (app.css, RESET / BASE). Rendered after the input in the DOM but
 * placed either side of it by CSS `order` (.stepper__button--dec/--inc), so
 * Tab still lands on the field first.
 *
 * @param props.label - What the field holds, for the buttons' labels.
 * @param props.canIncrement - False at the field's maximum, disabling "+".
 * @param props.canDecrement - False at the field's minimum, disabling "−".
 * @param props.onStep - Called with +1 or -1.
 * @param props.decrementTitle - Tooltip for "−", e.g. why it's disabled.
 * @returns The two buttons.
 */
export default function StepButtons({
  label,
  canIncrement,
  canDecrement,
  onStep,
  decrementTitle,
}: {
  label: string;
  canIncrement: boolean;
  canDecrement: boolean;
  onStep: (delta: 1 | -1) => void;
  decrementTitle?: string;
}) {
  return (
    <>
      <button
        type="button"
        className="stepper__button stepper__button--dec"
        aria-label={`Decrease ${label}`}
        title={decrementTitle}
        tabIndex={-1}
        disabled={!canDecrement}
        onClick={() => onStep(-1)}
      >
        <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
          <path d="M1.5 5h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="stepper__button stepper__button--inc"
        aria-label={`Increase ${label}`}
        tabIndex={-1}
        disabled={!canIncrement}
        onClick={() => onStep(1)}
      >
        <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
          <path d="M1.5 5h7M5 1.5v7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
