/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { usePopupKeys } from "./modal-support";

/** One row of a {@link ListPickerDialog}. */
export interface PickerItem {
  /** Stable identity (e.g. the file path). */
  key: string;
  /** Primary text: the project or schematic name. */
  name: string;
  /** Secondary text under the name: where it lives. */
  path: string;
  /** Label/value facts shown on the right, e.g. dates. */
  details: Array<{ label: string; value: string }>;
  /** Small tag after the name, e.g. "Open". */
  badge?: string;
}

/** Props for {@link ListPickerDialog}. */
interface ListPickerDialogProps {
  title: string;
  items: PickerItem[];
  /** True while items are still being fetched. */
  loading?: boolean;
  /** Shown when there are no items at all (not just no search matches). */
  emptyText: string;
  searchPlaceholder: string;
  /** Tooltip for the corner folder button. */
  browseLabel: string;
  onPick: (item: PickerItem) => void;
  /** Open the OS file dialog instead. */
  onBrowse: () => void;
  onClose: () => void;
}

/**
 * Whether an item matches a search: every whitespace-separated word must
 * appear (case-insensitively) in its name or path, so "cpu alu" finds
 * "ALU" inside the "CPU" project.
 *
 * @param item - The row.
 * @param query - The search text.
 * @returns True if it should be listed.
 */
function matches(item: PickerItem, query: string): boolean {
  const haystack = `${item.name}\n${item.path}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * A popup listing things to open (projects, schematics) under a search box,
 * with a folder button in the corner to browse the file system instead.
 *
 * Keys: typing filters (the search box has the cursor on open); ↑/↓ move
 * the highlight; Enter opens the highlighted row; Ctrl+/ jumps into the
 * search box and Escape out of it, then closes the popup.
 *
 * @param props - See {@link ListPickerDialogProps}.
 * @returns The popup.
 */
export default function ListPickerDialog({
  title,
  items,
  loading = false,
  emptyText,
  searchPlaceholder,
  browseLabel,
  onPick,
  onBrowse,
  onClose,
}: ListPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(
    () => items.filter((item) => matches(item, query)),
    [items, query],
  );
  const current = visible[Math.min(highlight, visible.length - 1)];

  // A new search starts the highlight back at the best (first) match.
  useEffect(() => setHighlight(0), [query]);

  const pickCurrent = useCallback(() => {
    if (current) {
      onPick(current);
    }
  }, [current, onPick]);

  usePopupKeys({
    inputRef,
    canSubmit: current !== undefined,
    onSubmit: pickCurrent,
    onClose,
  });

  // Arrow keys move the highlight wherever the cursor is in the popup.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      setHighlight((index) => {
        const last = visible.length - 1;
        if (last < 0) {
          return 0;
        }
        const from = Math.min(index, last);
        return event.key === "ArrowDown" ? Math.min(last, from + 1) : Math.max(0, from - 1);
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(".picker__row.is-highlighted")
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, visible]);

  const browseButton = (
    <button
      type="button"
      className="modal__icon-button"
      data-hover-fx="nudge-up"
      aria-label={browseLabel}
      title={browseLabel}
      onClick={onBrowse}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  return (
    <Modal title={title} onClose={onClose} actions={browseButton} wide>
      <div className="picker__search">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className="picker__search-input"
          value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? (
        <p className="picker__empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="picker__empty">{emptyText}</p>
      ) : visible.length === 0 ? (
        <p className="picker__empty">Nothing matches “{query}”.</p>
      ) : (
        <ul ref={listRef} className="picker__list" role="listbox" aria-label={title}>
          {visible.map((item, index) => (
            <li
              key={item.key}
              role="option"
              aria-selected={item === current}
              className={`picker__row${item === current ? " is-highlighted" : ""}`}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => onPick(item)}
              title={item.path}
            >
              <span className="picker__name">
                {item.name}
                {item.badge ? <span className="picker__badge">{item.badge}</span> : null}
              </span>
              <span className="picker__path">{item.path}</span>
              <span className="picker__details">
                {item.details.map((detail) => (
                  <span key={detail.label} className="picker__detail">
                    <span className="picker__detail-label">{detail.label}</span>{" "}
                    {detail.value}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
