/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  settleNamePrompt,
  useNamePromptStore,
  type NamePromptRequest,
} from "../state/name-prompt-store";
import Modal from "./Modal";
import { usePopupKeys } from "./modal-support";

/** Longest name accepted — matches a block name's limit in the inspector. */
const MAX_NAME_LENGTH = 40;

/**
 * The popup that asks for a name (a new project's, a new schematic's),
 * driven by `requestName` in name-prompt-store.ts. Mount once per window.
 *
 * @returns The popup, or null when nothing is being asked.
 */
export default function NamePromptDialog() {
  const request = useNamePromptStore((s) => s.request);
  return request ? <NamePromptBody request={request} /> : null;
}

/**
 * The open popup itself.
 *
 * @param props.request - What's being asked.
 * @returns The popup.
 */
function NamePromptBody({ request }: { request: NamePromptRequest }) {
  const [name, setName] = useState(request.initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const ready = trimmed.length > 0;

  const submit = useCallback(() => settleNamePrompt(trimmed), [trimmed]);
  const cancel = useCallback(() => settleNamePrompt(null), []);

  usePopupKeys({ inputRef, canSubmit: ready, onSubmit: submit, onClose: cancel });

  // Pre-selected, so the suggested name is replaced by the first keystroke.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <Modal title={request.title} onClose={cancel}>
      <input
        ref={inputRef}
        className="modal__input"
        value={name}
        aria-label="Name"
        spellCheck={false}
        autoComplete="off"
        maxLength={MAX_NAME_LENGTH}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="modal__actions">
        <button
          type="button"
          className="modal__button modal__button--primary"
          disabled={!ready}
          onClick={submit}
        >
          {request.submitLabel}
        </button>
      </div>
    </Modal>
  );
}
