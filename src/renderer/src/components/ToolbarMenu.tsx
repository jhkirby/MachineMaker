/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";

/** One action inside a {@link ToolbarMenu}'s dropdown panel. */
export interface ToolbarMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Props for {@link ToolbarMenu}. */
interface ToolbarMenuProps {
  /** Text on the trigger button, e.g. "File". */
  label: string;
  items: readonly ToolbarMenuItem[];
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
export default function ToolbarMenu({ label, items }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="toolbar-menu" ref={rootRef}>
      <button
        type="button"
        className="toolbar-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
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
              onClick={() => {
                setOpen(false);
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
