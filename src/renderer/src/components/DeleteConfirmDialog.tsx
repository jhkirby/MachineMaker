/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useRef, useState } from "react";
import { useDiagramStore } from "../state/diagram-store";
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

/**
 * Confirmation popup for deleting components, shown while `pendingDelete`
 * (diagram-store) is set. Keys follow usePopupKeys: Ctrl/Cmd+/ to the field,
 * Escape out of it (or closed), Enter deletes once it reads DELETE.
 *
 * @returns The popup, or null when nothing is pending.
 */
export default function DeleteConfirmDialog() {
  const pending = useDiagramStore((s) => s.pendingDelete);
  // Keyed on the pending request so each opening starts with an empty field.
  return pending ? (
    <DeleteConfirmBody key={pending.blockIds.join(",")} />
  ) : null;
}

/**
 * The open popup itself, mounted only while a delete is pending.
 *
 * @returns The popup.
 */
function DeleteConfirmBody() {
  const pending = useDiagramStore((s) => s.pendingDelete);
  const blocks = useDiagramStore((s) => s.diagram.blocks);
  const confirm = useDiagramStore((s) => s.confirmPendingDelete);
  const cancel = useDiagramStore((s) => s.cancelPendingDelete);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = text === CONFIRM_WORD;

  usePopupKeys({ inputRef, canSubmit: ready, onSubmit: confirm, onClose: cancel });

  const single =
    pending?.blockIds.length === 1
      ? blocks.find((block) => block.id === pending.blockIds[0])
      : undefined;

  return (
    <Modal
      title={single ? `Delete ${single.label}?` : "Delete these components?"}
      onClose={cancel}
    >
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
          onClick={confirm}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
