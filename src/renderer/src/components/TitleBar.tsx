/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useState, type ReactNode } from "react";

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
 * created with `frame: false` — see WindowManager). An empty draggable
 * region plus minimize/maximize/close buttons that mirror the native ones'
 * behavior via IPC; the buttons stay hidden until the pointer is over the
 * bar (app.css, TITLEBAR). Anything passed as children (the editor's tab
 * strip, TabBar.tsx) sits at the bar's left, ahead of the drag region.
 *
 * @param props.children - Optional content for the bar's left side.
 *
 * @returns The titlebar element.
 */
export default function TitleBar({ children }: { children?: ReactNode }) {
  const [maximized, setMaximized] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    void window.rtl.isWindowMaximized().then(setMaximized);
    return window.rtl.onWindowMaximizedChange(setMaximized);
  }, []);

  // Pushed from the main process, not read from :hover — the drag region
  // never sees mouse events (see WindowManager.watchTitlebarHover).
  useEffect(() => window.rtl.onTitlebarHoverChange(setHovered), []);

  return (
    <div className={`titlebar${hovered ? " titlebar--hovered" : ""}`}>
      {children}
      <div
        className="titlebar__drag-region"
        onDoubleClick={() => void window.rtl.windowToggleMaximize()}
      />
      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__button"
          onClick={() => void window.rtl.windowMinimize()}
          aria-label="Minimize"
          title="Minimize (Ctrl+M)"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="titlebar__button"
          onClick={() => void window.rtl.windowToggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={
            maximized ? "Restore (Ctrl+Shift+M)" : "Maximize (Ctrl+Shift+M)"
          }
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="titlebar__button titlebar__button--close"
          onClick={() => void window.rtl.windowClose()}
          aria-label="Close"
          title="Close window"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
