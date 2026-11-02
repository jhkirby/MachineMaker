/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import type { ReactNode } from "react";
import { useStore } from "@xyflow/react";
import type { DiagramCommands } from "../state/use-diagram-commands";
import { useDiagramStore } from "../state/diagram-store";

/**
 * 16×16 stroked icon frame shared by every view-control glyph, matching the
 * toolbar's other icons (undo/redo, theme) so the row reads as one set.
 *
 * @param props.children - The glyph's paths.
 * @returns An inline SVG that inherits color from its parent.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Props for {@link ViewControls}. */
interface ViewControlsProps {
  commands: DiagramCommands;
}

/**
 * The canvas's view controls — zoom in/out, fit, grid, lock — shown in the
 * toolbar beside the theme toggle rather than floating over the canvas.
 * Reads zoom and lock state straight from React Flow's store, which the
 * whole app sits inside (main.tsx), so it doesn't have to live in the canvas.
 *
 * @param props - See {@link ViewControlsProps}.
 * @returns The row of control buttons.
 */
export default function ViewControls({ commands }: ViewControlsProps) {
  const atMinZoom = useStore((s) => s.transform[2] <= s.minZoom);
  const atMaxZoom = useStore((s) => s.transform[2] >= s.maxZoom);
  const isInteractive = useStore(
    (s) => s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
  );
  const gridVisible = useDiagramStore((s) => s.gridVisible);

  return (
    <>
      <button
        type="button"
        className="toolbar__icon-button"
        disabled={atMaxZoom}
        onClick={() => commands.run("zoom-in")}
        title="Zoom in (+)"
        aria-label="Zoom in"
      >
        <Icon>
          <path d="M8 3v10M3 8h10" />
        </Icon>
      </button>
      <button
        type="button"
        className="toolbar__icon-button"
        disabled={atMinZoom}
        onClick={() => commands.run("zoom-out")}
        title="Zoom out (-)"
        aria-label="Zoom out"
      >
        <Icon>
          <path d="M3 8h10" />
        </Icon>
      </button>
      <button
        type="button"
        className="toolbar__icon-button"
        onClick={() => commands.run("fit-view")}
        title="Fit view (C)"
        aria-label="Fit view"
      >
        <Icon>
          <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
        </Icon>
      </button>
      <button
        type="button"
        className="toolbar__icon-button"
        onClick={() => commands.run("toggle-grid")}
        title={gridVisible ? "Hide grid (Ctrl+G)" : "Show grid (Ctrl+G)"}
        aria-label={gridVisible ? "Hide grid" : "Show grid"}
      >
        <Icon>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <path d="M8 2.5v11M2.5 8h11" />
        </Icon>
      </button>
      <button
        type="button"
        className="toolbar__icon-button"
        onClick={() => commands.run("toggle-lock")}
        title={isInteractive ? "Lock canvas (L)" : "Unlock canvas (L)"}
        aria-label={isInteractive ? "Lock canvas" : "Unlock canvas"}
      >
        <Icon>
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          {/* Unlocked: the shackle's right leg doesn't come back down. */}
          <path d={isInteractive ? "M5.5 7V5a2.5 2.5 0 0 1 5 0" : "M5.5 7V5a2.5 2.5 0 0 1 5 0v2"} />
        </Icon>
      </button>
    </>
  );
}
