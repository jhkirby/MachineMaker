/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDiagramStore } from "../state/diagram-store";
import {
  closeTab,
  exportTab,
  releaseTab,
  reorderTab,
  switchTab,
  useTabStore,
} from "../state/tab-store";
import { saveNow } from "../state/use-autosave";

/** How far, in px, the pointer must move before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

/**
 * How far above or below the strip, in px, the pointer can stray while
 * still reordering — past this the tab tears off (as in Chrome).
 */
const DETACH_DISTANCE = 30;

/** Bookkeeping for one tab drag, kept in a ref (it changes every move). */
interface DragSession {
  id: string;
  pointerId: number;
  /** Where the press started, in window coordinates. */
  startX: number;
  startY: number;
  /** Pointer offset from the tab's top-left corner at the press. */
  grabOffsetX: number;
  grabOffsetY: number;
  /** Past the threshold — a real drag, not a click. */
  active: boolean;
  /** Currently pulled away from the strip. */
  tornOff: boolean;
}

/** What the strip renders for the tab being dragged. */
interface DragView {
  id: string;
  /** Docked in the strip: horizontal offset from its slot. */
  shiftX: number;
  /** Torn off: where to float it, in window coordinates; null when docked. */
  floating: { left: number; top: number; width: number } | null;
}

/**
 * The editor's document tabs, drawn inside the titlebar (TitleBar.tsx).
 *
 * - **Click** a tab to switch to it; **middle-click** or its hover-only ×
 *   closes it.
 * - **Drag along the strip** to reorder.
 * - **Drag away from the strip** and release: dropped on another editor
 *   window's strip it moves there; anywhere else it opens in a new window
 *   at the pointer (a window's only tab moves the window itself). The main
 *   process decides which (IpcHandlers.detachTab), and the tab's undo
 *   history travels with it.
 *
 * Built on pointer capture, not HTML drag-and-drop: Chromium keeps
 * reporting a captured pointer while the button is held even outside the
 * window, so the release point is known wherever it lands, on any monitor.
 *
 * The active tab's name is read live from the diagram store, so renaming in
 * the toolbar updates it as you type. The house button goes to the home
 * page, leaving this window open.
 *
 * @returns The tab strip.
 */
export default function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeId = useTabStore((s) => s.activeId);
  const projectPath = useTabStore((s) => s.projectPath);
  const liveTitle = useDiagramStore((s) => s.diagram.title);
  const liveDirty = useDiagramStore((s) => s.dirty);

  const stripRef = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);

  const goHome = async () => {
    await saveNow();
    await window.rtl.returnHome(projectPath, false);
  };

  /** The rendered element for a tab, by id. */
  const tabElement = (id: string) =>
    stripRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`) ?? null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    session.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      active: false,
      tornOff: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = session.current;
    const strip = stripRef.current;
    if (!s || !strip || event.pointerId !== s.pointerId) {
      return;
    }
    if (!s.active) {
      if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) < DRAG_THRESHOLD) {
        return;
      }
      s.active = true;
    }
    const el = tabElement(s.id);
    if (!el) {
      return;
    }

    const stripRect = strip.getBoundingClientRect();
    s.tornOff = !(
      event.clientY >= stripRect.top - DETACH_DISTANCE &&
      event.clientY <= stripRect.bottom + DETACH_DISTANCE &&
      event.clientX >= 0 &&
      event.clientX <= window.innerWidth
    );
    if (s.tornOff) {
      setDrag({
        id: s.id,
        shiftX: 0,
        floating: {
          left: event.clientX - s.grabOffsetX,
          top: event.clientY - s.grabOffsetY,
          width: el.offsetWidth,
        },
      });
      return;
    }

    // Reorder: the dragged tab's would-be center, against the other tabs'
    // midpoints, picks its slot.
    const draggedLeft = event.clientX - s.grabOffsetX;
    const draggedCenter = draggedLeft + el.offsetWidth / 2;
    const index = [...strip.querySelectorAll<HTMLElement>("[data-tab-id]")]
      .filter((other) => other.dataset["tabId"] !== s.id)
      .filter((other) => {
        const r = other.getBoundingClientRect();
        return r.left + r.width / 2 < draggedCenter;
      }).length;
    reorderTab(s.id, index);

    // offsetLeft is the slot's own position, unaffected by the transform.
    const slotLeft = stripRect.left + el.offsetLeft;
    setDrag({ id: s.id, shiftX: draggedLeft - slotLeft, floating: null });
  };

  const endDrag = () => {
    session.current = null;
    setDrag(null);
  };

  const onPointerUp = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = session.current;
    const strip = stripRef.current;
    if (!s || !strip || event.pointerId !== s.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDrag();
    if (!s.active) {
      void switchTab(s.id);
      return;
    }
    if (!s.tornOff) {
      return;
    }

    const document = await exportTab(s.id);
    if (!document) {
      return;
    }
    // Where the grabbed spot sits in a window whose strip holds only this
    // tab, so a new (or moved) window lands with the tab under the pointer.
    const result = await window.rtl.detachTab({
      document,
      screenX: event.screenX,
      screenY: event.screenY,
      grabX: strip.getBoundingClientRect().left + s.grabOffsetX,
      grabY: s.grabOffsetY,
      sourceTabCount: useTabStore.getState().tabs.length,
    });
    if (result !== "moved") {
      releaseTab(s.id);
    }
  };

  return (
    <div className="tab-bar">
      <button
        type="button"
        className="tab-bar__home"
        data-hover-fx="nudge-up"
        title="Home (Ctrl+H)"
        aria-label="Home"
        onClick={() => void goHome()}
      >
        <svg
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 7.5 8 2.75l5.5 4.75M4 6.5v7h3v-4h2v4h3v-7" />
        </svg>
      </button>
      <div
        ref={stripRef}
        className="tab-bar__tabs"
        role="tablist"
        aria-label="Open schematics"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const title = active ? liveTitle : (tab.snapshot?.diagram.title ?? "");
          const view = drag?.id === tab.id ? drag : null;
          const style = !view
            ? undefined
            : view.floating
              ? {
                  position: "fixed" as const,
                  left: view.floating.left,
                  top: view.floating.top,
                  width: view.floating.width,
                }
              : { transform: `translateX(${view.shiftX}px)` };
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`tab-bar__tab${active ? " is-active" : ""}${
                view ? " is-dragging" : ""
              }${view?.floating ? " is-torn-off" : ""}`}
              style={style}
              title={title}
              onPointerDown={(event) => onPointerDown(event, tab.id)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => void onPointerUp(event)}
              onPointerCancel={endDrag}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  void closeTab(tab.id);
                }
              }}
            >
              <span className="tab-bar__label">{title}</span>
              {active && liveDirty ? (
                <span className="tab-bar__dirty" aria-label="Unsaved changes" />
              ) : null}
              <button
                type="button"
                className="tab-bar__close"
                aria-label={`Close ${title}`}
                tabIndex={-1}
                // Keep a press on × from starting a tab drag.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
              >
                <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
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
          );
        })}
      </div>
    </div>
  );
}
