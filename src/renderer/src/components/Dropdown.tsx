/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

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
  // Where to paint the portaled panel (below), in viewport coordinates, plus
  // the block-color custom properties (see blockColorVars below) it needs to
  // carry with it — recomputed from the trigger every time the panel opens.
  // Null while closed, and for the one layout pass before it's first
  // measured.
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    minWidth: number;
    blockColorVars: CSSProperties;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    setActiveIndex(Math.max(0, options.indexOf(value)));
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      // --block-stroke/--block-stroke-glow (the option list's selected/hover
      // colors) are set way up on .inspector__section and normally just
      // inherit down — but a CSS custom property only inherits along the
      // real DOM tree, and the portal below moves this panel to be a child
      // of <body>, off of that tree entirely. Reading the trigger's already-
      // inherited computed values here and reapplying them as an inline
      // style on the portaled panel (below) restores that inheritance by
      // hand for whatever this element would otherwise have lost.
      const computed = getComputedStyle(trigger);
      const blockColorVars: CSSProperties = {};
      for (const prop of ["--block-stroke", "--block-stroke-glow"] as const) {
        const value = computed.getPropertyValue(prop).trim();
        if (value) {
          (blockColorVars as Record<string, string>)[prop] = value;
        }
      }
      setPanelRect({
        top: rect.bottom + 2,
        left: rect.left,
        minWidth: rect.width,
        blockColorVars,
      });
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    // The panel portals to <body> (see the render below) specifically so it
    // can escape a scrollable ancestor's clipping (e.g. the port table's own
    // overflow-y: auto) instead of being cut off at that ancestor's edge —
    // but that means it no longer scrolls along with whatever it was
    // measured against. Rather than re-measuring on every scroll tick,
    // closing on the first one matches a native <select>'s own behavior
    // (its popup dismisses the moment the page scrolls) and is simpler.
    const onScroll = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
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
        ref={triggerRef}
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
      {open && panelRect
        ? createPortal(
            // Portaled to <body> — not a child of .dropdown any more — so a
            // scrollable ancestor (e.g. the port table) can never clip it,
            // positioned via inline style from panelRect since it no longer
            // has .dropdown to be `position: absolute` against.
            <ul
              ref={panelRef}
              className="dropdown__panel"
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: "fixed",
                top: panelRect.top,
                left: panelRect.left,
                minWidth: panelRect.minWidth,
                ...panelRect.blockColorVars,
              }}
            >
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
