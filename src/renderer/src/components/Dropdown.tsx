/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/** Props for {@link Dropdown}. */
interface DropdownProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}

/**
 * Small chevron that flips to point up while the panel is open — same glyph
 * as ToolbarMenu's, reused here so every dropdown trigger in the app reads
 * as one family.
 *
 * @param props.open - Whether the panel is currently shown.
 * @returns A small inline chevron.
 */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="dropdown__chevron"
      viewBox="0 0 10 10"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
      aria-hidden="true"
    >
      <path d="M2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

/**
 * A single-select dropdown, standing in for a plain `<select>` wherever the
 * open list itself needs to be styled beyond what a native `<select>`
 * allows — on Windows, Chromium renders an open `<select>`'s hover row with
 * the OS's own system highlight color, which no CSS can override, so a
 * dropdown expected to glow in a block's own custom color (see
 * --block-stroke) needs a real element to style instead. Closes on an
 * outside click, Escape, or picking an option; Up/Down arrows move a
 * keyboard-highlighted option while open.
 *
 * @param props - See {@link DropdownProps}.
 * @returns The trigger button and, while open, its option list.
 */
export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(Math.max(0, options.indexOf(value)));
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, value, options]);

  /** Commit a picked option and close the panel. */
  const commit = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(options[activeIndex]);
    }
  };

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="dropdown__value">{value}</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <ul className="dropdown__panel" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={`dropdown__option${
                option === value ? " is-selected" : ""
              }${index === activeIndex ? " is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
