/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useRef, useState, type ReactNode } from "react";
import Modal from "./Modal";
import { usePopupKeys } from "./modal-support";

/** The exact word the user must type to unlock deletion. */
const CONFIRM_WORD = "DELETE";

/**
 * Keep only input that still spells a prefix of {@link CONFIRM_WORD}
 * (case-insensitively), shown upper-cased — anything else is rejected
 * outright rather than shown and then flagged, so the field can only ever
 * hold part (or all) of the one correct sequence.
 *
 * @param next - The field's raw new value.
 * @param previous - The value it held before this edit.
 * @returns The upper-cased value to keep.
 */
function filterConfirmInput(next: string, previous: string): string {
  const upper = next.toUpperCase();
  return CONFIRM_WORD.startsWith(upper) ? upper : previous;
}

/** Props for {@link TypedDeleteDialog}. */
interface TypedDeleteDialogProps {
  /** Heading, e.g. "Delete My schematic?". */
  title: string;
  /** Optional line under the heading saying what deleting will do. */
  detail?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation popup for anything destructive: Confirm stays disabled until
 * the user types DELETE. Keys follow usePopupKeys — Ctrl/Cmd+/ to the
 * field, Escape out of it (or closed), Enter confirms once it reads DELETE.
 * Mount it fresh for each request (or key it) so the field starts empty.
 *
 * @param props - See {@link TypedDeleteDialogProps}.
 * @returns The popup.
 */
export default function TypedDeleteDialog({
  title,
  detail,
  onConfirm,
  onCancel,
}: TypedDeleteDialogProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = text === CONFIRM_WORD;

  usePopupKeys({ inputRef, canSubmit: ready, onSubmit: onConfirm, onClose: onCancel });

  return (
    <Modal title={title} onClose={onCancel}>
      {detail ? <p className="modal__detail">{detail}</p> : null}
      <input
        ref={inputRef}
        className="modal__input modal__input--code"
        value={text}
        placeholder={CONFIRM_WORD}
        aria-label={`Type ${CONFIRM_WORD} to confirm`}
        spellCheck={false}
        autoComplete="off"
        maxLength={CONFIRM_WORD.length}
        onChange={(event) =>
          setText((previous) => filterConfirmInput(event.target.value, previous))
        }
      />
      <div className="modal__actions">
        <button
          type="button"
          className="modal__button"
          disabled={!ready}
          onClick={onConfirm}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
