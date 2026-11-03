/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

/** Props for {@link CommitInput}. */
interface CommitInputProps {
  /** Current committed value from the model. */
  value: string;
  /** Called with the new value on blur or Enter, only when it changed. */
  onCommit: (next: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
  /** Forwarded to the input for `type="number"`. */
  min?: number;
  /** Forwarded to the input for `type="number"`. */
  max?: number;
}

/**
 * Text/number input that keeps keystrokes local and only pushes a value to the
 * model on blur or Enter — so a single edit is one undo step, not one per key.
 *
 * @param props - See {@link CommitInputProps}.
 * @returns The input element.
 */
export default function CommitInput({
  value,
  onCommit,
  type = "text",
  placeholder,
  className,
  min,
  max,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  /** Push the draft to the model if it actually changed. */
  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <input
      className={className}
      type={type}
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
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
}
