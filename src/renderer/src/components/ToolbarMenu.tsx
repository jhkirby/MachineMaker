/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";

/** One action inside a {@link ToolbarMenu}'s dropdown panel. */
export interface ToolbarMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Tooltip — e.g. why the item is disabled. */
  title?: string;
}

/** Props for {@link ToolbarMenu}. */
interface ToolbarMenuProps {
  /** Text on the trigger button, e.g. "File". */
  label: string;
  items: readonly ToolbarMenuItem[];
  /** Tooltip for the trigger button, e.g. `"File menu (Ctrl+F)"`. */
  title?: string;
  /** Whether the dropdown panel is shown — lifted to the caller so a global
   *  keyboard shortcut (Ctrl+F / Ctrl+E, see use-keyboard-shortcuts.ts) can
   *  open a specific menu from outside this component. */
  open: boolean;
  /** Called to open, close, or (on an outside click/Escape/item pick) request
   *  closing the panel. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Small chevron that flips to point up while the panel is open, echoing the
 * disclosure state the same way a native `<select>` arrow would. A real SVG
 * rather than a text glyph — see PanelToggleIcon in ComponentPalette.tsx for
 * why: consistent sizing and optical centering no font can promise.
 *
 * @param props.open - Whether the panel is currently shown.
 * @returns A small inline chevron.
 */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="toolbar-menu__chevron"
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
 * A toolbar button that opens a small dropdown of related actions — the
 * grouped equivalent of a row of individual toolbar buttons, for actions
 * (File: New/Open/Save, Export: PNG/SVG) that belong together but don't each
 * need to be one click away. Closes on an outside click, Escape, or picking
 * an item.
 *
 * @param props - See {@link ToolbarMenuProps}.
 * @returns The menu trigger and, while open, its dropdown panel.
 */
export default function ToolbarMenu({
  label,
  items,
  title,
  open,
  onOpenChange,
}: ToolbarMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className="toolbar-menu" ref={rootRef}>
      <button
        type="button"
        className="toolbar-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className="toolbar-menu__panel" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="toolbar-menu__item"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                onOpenChange(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
