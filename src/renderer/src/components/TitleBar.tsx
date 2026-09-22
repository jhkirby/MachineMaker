/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import { useDiagramStore } from "../state/diagram-store";

/**
 * Single horizontal bar glyph for the minimize button.
 *
 * @returns A 10×10 inline SVG that inherits color from its parent.
 */
function MinimizeIcon() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/**
 * Plain square outline for the maximize button.
 *
 * @returns A 10×10 inline SVG that inherits color from its parent.
 */
function MaximizeIcon() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Two overlapping square outlines for the restore-down button, drawn as a
 * front square plus a partial back square (only the corner that would
 * otherwise peek out from behind it) rather than a filled occluder — a fill
 * would have to match whatever's under the button (resting vs. hover), which
 * a plain `currentColor` stroke never needs to track.
 *
 * @returns A 10×10 inline SVG that inherits color from its parent.
 */
function RestoreIcon() {
  return (
    <svg
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      <path d="M2.5 0.5h7v7h-2" />
      <rect x="0.5" y="2.5" width="7" height="7" />
    </svg>
  );
}

/**
 * X glyph for the close button.
 *
 * @returns A 10×10 inline SVG that inherits color from its parent.
 */
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 10 10"
      width="10"
      height="10"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
    </svg>
  );
}

/**
 * Custom window titlebar, replacing the native OS chrome (the window is
 * created with `frame: false` — see WindowManager). Draws the app icon and
 * document title over a draggable region, plus minimize/maximize/close
 * buttons that mirror the native ones' behavior via IPC.
 *
 * @returns The titlebar element.
 */
export default function TitleBar() {
  const title = useDiagramStore((s) => s.diagram.title);
  const dirty = useDiagramStore((s) => s.dirty);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.rtl.isWindowMaximized().then(setMaximized);
    return window.rtl.onWindowMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="titlebar">
      <div
        className="titlebar__drag-region"
        onDoubleClick={() => void window.rtl.windowToggleMaximize()}
      >
        <img className="titlebar__icon" src="/icon.svg" alt="" aria-hidden="true" />
        <span className="titlebar__text">
          {dirty ? <span className="titlebar__dirty">●</span> : null}
          {title} — RTL Schematic
        </span>
      </div>
      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__button"
          onClick={() => void window.rtl.windowMinimize()}
          aria-label="Minimize"
          title="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="titlebar__button"
          onClick={() => void window.rtl.windowToggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="titlebar__button titlebar__button--close"
          onClick={() => void window.rtl.windowClose()}
          aria-label="Close"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
