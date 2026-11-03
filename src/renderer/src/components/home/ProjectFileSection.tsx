/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { ReactNode } from "react";

/** One file listed in a {@link ProjectFileSection}. */
export interface ProjectFileItem {
  /** Absolute path — also the row's identity. */
  path: string;
  name: string;
  /** Right-aligned detail text, e.g. "3 components · edited 2 hours ago". */
  meta: string;
}

/** Props for {@link ProjectFileSection}. */
interface ProjectFileSectionProps {
  /** Section heading, e.g. "Schematics". */
  label: string;
  items: readonly ProjectFileItem[];
  /** Line icon drawn at the start of every row. */
  glyph: ReactNode;
  /** Shown in place of the list when there are no items. */
  emptyText: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** Disables every action while a home-page action is in flight. */
  busy: boolean;
  /** Open the selected file (also what double-clicking a row does). */
  onOpen: (path: string) => void;
  /** Tooltip for the Open button, e.g. when opening isn't supported yet. */
  openTitle?: string;
  /** Ask to delete the selected file — the caller confirms first. */
  onDelete: (item: ProjectFileItem) => void;
  newLabel: string;
  onNew: () => void;
  /** Whether New is available at all (separate from `busy`). */
  newEnabled: boolean;
  newTitle?: string;
}

/**
 * One list card on a project's page — its schematics or its state
 * machines: a heading with a count, the Delete / Open / New actions, and
 * the selectable rows. Delete and Open act on the selected row, so both
 * stay disabled until one is picked.
 *
 * @param props - See {@link ProjectFileSectionProps}.
 * @returns The section.
 */
export default function ProjectFileSection({
  label,
  items,
  glyph,
  emptyText,
  selectedPath,
  onSelect,
  busy,
  onOpen,
  openTitle,
  onDelete,
  newLabel,
  onNew,
  newEnabled,
  newTitle,
}: ProjectFileSectionProps) {
  const selected = items.find((item) => item.path === selectedPath) ?? null;

  return (
    <section className="home-card" aria-label={label}>
      <div className="home-card__header">
        <p className="home-card__eyebrow">
          {label} <span className="home-card__count">{items.length}</span>
        </p>
        <div className="home-card__header-actions">
          <button
            type="button"
            className="home-button home-button--small home-button--danger"
            disabled={!selected || busy}
            title={selected ? `Delete ${selected.name}` : "Select one to delete it"}
            onClick={() => selected && onDelete(selected)}
          >
            Delete
          </button>
          <button
            type="button"
            className="home-button home-button--small"
            disabled={!selected || busy}
            title={openTitle}
            onClick={() => selected && onOpen(selected.path)}
          >
            Open
          </button>
          <button
            type="button"
            className="home-button home-button--small home-button--primary"
            disabled={busy || !newEnabled}
            title={newTitle}
            onClick={onNew}
          >
            {newLabel}
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="landing__empty">{emptyText}</p>
      ) : (
        <ul className="item-list" role="listbox" aria-label={label}>
          {items.map((item) => {
            const isSelected = item.path === selectedPath;
            return (
              <li
                key={item.path}
                role="option"
                aria-selected={isSelected}
                className={`item-list__row${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelect(item.path)}
                onDoubleClick={() => !busy && onOpen(item.path)}
                title="Double-click to open"
              >
                <span className="item-list__glyph" aria-hidden="true">
                  {glyph}
                </span>
                <span className="item-list__name">{item.name}</span>
                <span className="item-list__meta">{item.meta}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
