/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

/** Props for {@link NumericField}. */
interface NumericFieldProps {
  /** Current committed value from the model. Always a real number. */
  value: number;
  /** Called with a valid, changed integer on blur or Enter. */
  onCommit: (next: number) => void;
  min: number;
  max: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Integer input that is never blank: it shows a red border while the text does
 * not parse to an integer within `[min, max]`, and on blur it either commits a
 * valid value or snaps back to the last good one.
 *
 * @param props - See {@link NumericFieldProps}.
 * @returns The input element.
 */
export default function NumericField({
  value,
  onCommit,
  min,
  max,
  className,
  ariaLabel,
}: NumericFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const parsed = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : NaN;
  const invalid = !Number.isInteger(parsed) || parsed < min || parsed > max;

  /** Commit a valid draft, or restore the last good value. */
  const commit = () => {
    if (!invalid && parsed !== value) {
      onCommit(parsed);
    } else if (invalid) {
      setDraft(String(value));
    }
  };

  return (
    <input
      className={`${className ?? ""}${invalid ? " is-invalid" : ""}`.trim()}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}
