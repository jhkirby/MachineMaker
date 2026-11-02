/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import {
  acceptsNameInput,
  isCompleteName,
  type NameRules,
} from "../model/naming";

/** Props for {@link NameInput}. */
interface NameInputProps {
  /** Current committed value from the model. */
  value: string;
  /** Called with a complete, changed value on blur or Enter. */
  onCommit: (next: string) => void;
  /** Whether a space may separate words (block/diagram names yes, ports no). */
  allowSpaces?: boolean;
  /**
   * Whether digits are allowed after the leading letter (component names yes,
   * port names no). Defaults to true.
   */
  allowDigits?: boolean;
  /** Names already in use by siblings; matching one is treated as invalid. */
  takenNames?: readonly string[];
  /** Longest draft the field accepts, in characters. */
  maxLength?: number;
  /**
   * Whether a "current/max characters" counter is shown below the box on
   * focus or hover, when {@link maxLength} is set. Defaults to true; set
   * false to enforce the limit without the overlay, e.g. in a layout too
   * tight for it.
   */
  showCounter?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Text input governed by the shared naming rules: keystrokes that would break
 * the rules never register, an incomplete draft shows a red border, and only a
 * complete value is pushed to the model (on blur or Enter) so one edit is one
 * undo step.
 *
 * @param props - See {@link NameInputProps}.
 * @returns The input element.
 */
export default function NameInput({
  value,
  onCommit,
  allowSpaces = false,
  allowDigits = true,
  takenNames,
  maxLength,
  showCounter = true,
  className,
  ariaLabel,
}: NameInputProps) {
  const rules = useMemo<NameRules>(
    () => ({ allowSpaces, allowDigits }),
    [allowSpaces, allowDigits],
  );
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const duplicate = (takenNames ?? []).includes(draft);
  const invalid = !isCompleteName(draft, rules) || duplicate;

  /** Commit a complete draft, or snap back to the last good value. */
  const commit = () => {
    if (!invalid && draft !== value) {
      onCommit(draft);
    } else if (invalid) {
      setDraft(value);
    }
  };

  const input = (
    <input
      className={`${className ?? ""}${invalid ? " is-invalid" : ""}`.trim()}
      value={draft}
      maxLength={maxLength}
      aria-label={ariaLabel}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        if (
          (maxLength === undefined || next.length <= maxLength) &&
          acceptsNameInput(next, rules)
        ) {
          setDraft(next);
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        commit();
        setFocused(false);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );

  if (maxLength === undefined || !showCounter) {
    return input;
  }

  return (
    <span className="name-input">
      {input}
      <span
        className={`name-input__counter${focused || hovered ? " is-visible" : ""}`}
      >
        {draft.length}/{maxLength} characters
      </span>
    </span>
  );
}
