/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Props for {@link Modal}. */
interface ModalProps {
  /** Heading, centered at the top. */
  title: string;
  /** Called by the corner × button. */
  onClose: () => void;
  /** Extra icon buttons for the top-right corner, left of the ×. */
  actions?: ReactNode;
  /** Widen the card for list popups (the default suits a single field). */
  wide?: boolean;
  children: ReactNode;
}

/**
 * Shell for every popup: a centered card over a full-window blurred
 * backdrop, with the title on top and a × in the corner. Portaled to
 * `<body>` so it can make the whole app root (`#root`) inert while open —
 * the blur only *looks* disabled; inert is what actually stops clicks, focus
 * and Tab from reaching anything behind it.
 *
 * @param props - See {@link ModalProps}.
 * @returns The popup, rendered into `<body>`.
 */
export default function Modal({ title, onClose, actions, wide, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) {
      return;
    }
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop">
      <div
        className={`modal${wide ? " modal--wide" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__corner">
          {actions}
          <button
            type="button"
            className="modal__icon-button"
            aria-label="Close"
            title="Close (Esc)"
            onClick={onClose}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path
                d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
