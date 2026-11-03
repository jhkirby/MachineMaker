/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Shared behavior for popups built on Modal.tsx — kept out of that component
// file so it stays component-only (a requirement for React Fast Refresh).

import { useEffect, type RefObject } from "react";

/**
 * Whether a popup currently owns the window — true while any Modal is open
 * (it makes `#root` inert). Global keyboard shortcuts check this and stand
 * aside, since the popup handles its own keys and nothing behind it may run.
 *
 * @returns True while a popup is open.
 */
export function isModalOpen(): boolean {
  return document.getElementById("root")?.inert ?? false;
}

/** Options for {@link usePopupKeys}. */
interface PopupKeyOptions {
  /** The popup's one text field. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Whether Enter should submit right now. */
  canSubmit: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * The keyboard contract every text-entry popup shares: Ctrl/Cmd+/ jumps the
 * cursor into the field; Escape takes it back out, or — with the field
 * already unfocused — closes the popup; Enter submits once `canSubmit`.
 * Listens on the window rather than the field, so Ctrl+/ and Enter still
 * work after Escape has taken the cursor out. Also focuses the field on
 * mount, so typing can start straight away.
 *
 * @param options - See {@link PopupKeyOptions}.
 */
export function usePopupKeys({
  inputRef,
  canSubmit,
  onSubmit,
  onClose,
}: PopupKeyOptions): void {
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        event.preventDefault();
        input?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (document.activeElement === input) {
          input?.blur();
        } else {
          onClose();
        }
      } else if (event.key === "Enter" && canSubmit) {
        event.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputRef, canSubmit, onSubmit, onClose]);
}
