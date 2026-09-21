/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect } from "react";
import type { EditorCommand } from "../../../shared/ipc-contract";
import type { DiagramCommands } from "./use-diagram-commands";

/** One key chord and the editor command it fires. */
interface Shortcut {
  /**
   * Matched (lower-cased) against `KeyboardEvent.key`. A list of keys means any
   * of them fires the command — used for the several ways to press `+` / `-`.
   */
  key: string | readonly string[];
  /** Requires the platform command modifier (Ctrl on Win/Linux, Cmd on macOS). */
  mod: boolean;
  /** For `mod` chords only: requires Shift held (and its absence forbids it). */
  shift?: boolean;
  command: EditorCommand;
}

// `mod: true` chords replace the old native-menu accelerators and fire even
// from inside a field. The bare-key chords (mod: false) are canvas view
// controls and are suppressed while a text field or dropdown has focus.
const SHORTCUTS: readonly Shortcut[] = [
  { key: "n", mod: true, command: "new" },
  { key: "o", mod: true, command: "open" },
  { key: "s", mod: true, command: "save" },
  { key: "s", mod: true, shift: true, command: "save-as" },
  { key: "z", mod: true, command: "undo" },
  { key: "z", mod: true, shift: true, command: "redo" },
  { key: "y", mod: true, command: "redo" },
  { key: "g", mod: true, command: "toggle-grid" },
  { key: "t", mod: true, command: "toggle-theme" },
  { key: "1", mod: true, command: "fit-view" },
  { key: ["+", "="], mod: false, command: "zoom-in" },
  { key: ["-", "_"], mod: false, command: "zoom-out" },
  { key: "c", mod: false, command: "fit-view" },
  { key: "l", mod: false, command: "toggle-lock" },
  { key: "p", mod: false, command: "add-port" },
  { key: "escape", mod: false, command: "deselect" },
];

/** Element tag names whose focus should swallow bare-key shortcuts. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether the event originates from somewhere the user is typing.
 *
 * @param target - The event target.
 * @returns True if a text field, dropdown, or editable region has focus.
 */
function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el && (EDITABLE_TAGS.has(el.tagName) || el.isContentEditable)
  );
}

/**
 * Whether a shortcut's key spec covers the pressed key.
 *
 * @param spec - A single key or a list of alternatives.
 * @param key - The lower-cased `KeyboardEvent.key`.
 * @returns True on a match.
 */
function keyMatches(spec: string | readonly string[], key: string): boolean {
  return typeof spec === "string" ? spec === key : spec.includes(key);
}

/**
 * Bind the editor's global keyboard shortcuts for the lifetime of the
 * component. A matching shortcut is swallowed (no browser default) and routed
 * through the command set; anything else passes through untouched.
 *
 * @param commands - The editor command set to dispatch into.
 */
export function useKeyboardShortcuts(commands: DiagramCommands): void {
  useEffect(() => {
    /**
     * Resolve a keydown to a shortcut and run it.
     *
     * @param event - The originating keyboard event.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const match = SHORTCUTS.find((shortcut) => {
        if (!keyMatches(shortcut.key, key) || shortcut.mod !== mod) {
          return false;
        }
        if (shortcut.mod) {
          return Boolean(shortcut.shift) === event.shiftKey;
        }
        return !isEditingTarget(event.target);
      });
      if (match) {
        event.preventDefault();
        commands.run(match.command);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands]);
}
