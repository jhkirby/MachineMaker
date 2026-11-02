/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import type { DragEvent } from "react";
import type { BlockKind } from "../../../shared/diagram-model";
import { paletteFor } from "../model/block-appearance";
import { COMPONENT_LIBRARY } from "../model/component-library";
import { useDiagramStore } from "../state/diagram-store";
import ComponentIcon from "./ComponentIcon";

/** MIME-like key used to carry a block kind through a drag operation. */
export const PALETTE_DRAG_TYPE = "application/rtl-kind";

// A fully transparent 1x1 GIF. Handed to every palette drag as the native drag
// image so the browser paints nothing of its own — the canvas renders its own
// grid-snapped preview instead (see DiagramCanvas), which a static native drag
// image could never match: it can't rescale with canvas zoom or reposition
// itself except 1:1 with the cursor.
const EMPTY_DRAG_IMAGE = new Image();
EMPTY_DRAG_IMAGE.src =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Double-chevron glyph for the palette's collapse/expand button. A real SVG
 * rather than a "«"/"»" text glyph: those characters sit at font-specific,
 * inconsistent optical centers, so no amount of CSS nudging kept them looking
 * centered in the square button — this draws exactly on the geometry we want.
 *
 * @param props.direction - Which way the chevrons point.
 * @returns A 16×16 inline SVG that inherits color from its parent.
 */
function PanelToggleIcon({ direction }: { direction: "left" | "right" }) {
  const d =
    direction === "left"
      ? "M7.33 11.33 4 8 7.33 4.67 M12 11.33 8.67 8 12 4.67"
      : "M8.67 11.33 12 8 8.67 4.67 M4 11.33 7.33 8 4 4.67";
  return (
    <svg
      className="palette__toggle-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Left sidebar listing every component. Clicking an entry enters place mode
 * (the block follows the pointer until a canvas click drops it); entries can
 * also be dragged onto the canvas or double-clicked to drop one near the
 * origin. A header button
 * collapses the panel to a slim rail and expands it again.
 *
 * @returns The palette element.
 */
export default function ComponentPalette() {
  const addBlock = useDiagramStore((s) => s.addBlock);
  const collapsed = useDiagramStore((s) => s.paletteCollapsed);
  const togglePalette = useDiagramStore((s) => s.togglePalette);
  const setDraggingKind = useDiagramStore((s) => s.setDraggingKind);
  const placingKind = useDiagramStore((s) => s.placingKind);
  // Click toggles place mode: the same item turns it off, a different item
  // switches what's being placed. The canvas does the rest (DiagramCanvas).
  const togglePlacingKind = useDiagramStore((s) => s.togglePlacingKind);

  const onDragStart = (event: DragEvent, kind: BlockKind) => {
    event.dataTransfer.setData(PALETTE_DRAG_TYPE, kind);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
    setDraggingKind(kind);
  };

  // Fires after a drop *and* after a cancelled drag (dropped outside any
  // target, Escape pressed) — either way the canvas's preview must clear.
  const onDragEnd = () => setDraggingKind(null);

  return (
    <aside className={`palette${collapsed ? " palette--collapsed" : ""}`}>
      <div className="palette__header">
        {!collapsed ? <h2 className="palette__heading">Components</h2> : null}
        <button
          type="button"
          className="palette__toggle"
          data-hover-fx={collapsed ? "nudge-right" : "nudge-left"}
          onClick={togglePalette}
          title={collapsed ? "Expand panel (Ctrl+L)" : "Collapse panel (Ctrl+L)"}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          <PanelToggleIcon direction={collapsed ? "right" : "left"} />
        </button>
      </div>

      {/* Still listed when collapsed — just as icons, so the rail stays a
          working palette rather than an empty strip. */}
      <ul className="palette__list">
        {COMPONENT_LIBRARY.map((template) => {
          const colors = paletteFor(template.kind);
          return (
            <li key={template.kind}>
              <button
                type="button"
                className={`palette__item${
                  placingKind === template.kind ? " palette__item--placing" : ""
                }`}
                title={`Add ${template.displayName} (${template.placeKey.toUpperCase()})`}
                aria-label={`Add ${template.displayName}`}
                aria-pressed={placingKind === template.kind}
                draggable
                onClick={() => togglePlacingKind(template.kind)}
                onDragStart={(event) => onDragStart(event, template.kind)}
                onDragEnd={onDragEnd}
                onDoubleClick={() => addBlock(template.kind, 80, 80)}
                style={{ borderLeftColor: colors.stroke }}
              >
                <span
                  className="palette__icon-slot"
                  style={{ color: colors.stroke }}
                >
                  <ComponentIcon kind={template.kind} />
                </span>
                {!collapsed ? (
                  <span className="palette__label">{template.displayName}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
