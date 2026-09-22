/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import type { DiagramCommands } from "../state/use-diagram-commands";
import { useDiagramStore, type Theme } from "../state/diagram-store";
import NameInput from "./NameInput";
import ToolbarMenu from "./ToolbarMenu";

/**
 * Plain back (undo) or forward (redo) arrow. A real SVG rather than a text
 * glyph — see PanelToggleIcon in ComponentPalette.tsx for why: consistent
 * sizing and optical centering no font can promise.
 *
 * @param props.direction - Which history direction the arrow represents.
 * @returns A 16×16 inline SVG that inherits color from its parent.
 */
function HistoryArrowIcon({ direction }: { direction: "undo" | "redo" }) {
  const d = direction === "undo" ? "M10 3.5 4 8l6 4.5" : "M6 3.5 12 8l-6 4.5";
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Props for {@link Toolbar}. */
interface ToolbarProps {
  commands: DiagramCommands;
}

/**
 * Sun (dark mode: click to go light) or moon (light mode: click to go dark)
 * glyph for the theme toggle. A real SVG rather than a text/emoji glyph —
 * see PanelToggleIcon in ComponentPalette.tsx for why: consistent sizing and
 * optical centering that no font can promise across platforms.
 *
 * @param props.theme - The app's current theme; picks which glyph to draw.
 * @returns A 16×16 inline SVG that inherits color from its parent.
 */
function ThemeToggleIcon({ theme }: { theme: Theme }) {
  return theme === "dark" ? (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 0.75V2.5M8 13.5v1.75M15.25 8h-1.75M2.5 8H0.75M12.77 3.23l-1.24 1.24M4.47 11.53l-1.24 1.24M12.77 12.77l-1.24-1.24M4.47 4.47 3.23 3.23" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 9.7A6.25 6.25 0 0 1 6.3 2a6.5 6.5 0 1 0 7.7 7.7Z" />
    </svg>
  );
}

/**
 * Top application bar: document title/dirty indicator on the left, the common
 * actions as buttons on the right.
 *
 * @param props - See {@link ToolbarProps}.
 * @returns The toolbar element.
 */
export default function Toolbar({ commands }: ToolbarProps) {
  const title = useDiagramStore((s) => s.diagram.title);
  const setTitle = useDiagramStore((s) => s.setTitle);
  const dirty = useDiagramStore((s) => s.dirty);
  const canUndo = useDiagramStore((s) => s.past.length > 0);
  const canRedo = useDiagramStore((s) => s.future.length > 0);
  const theme = useDiagramStore((s) => s.theme);
  const toggleTheme = useDiagramStore((s) => s.toggleTheme);
  const openMenu = useDiagramStore((s) => s.openMenu);
  const toggleMenu = useDiagramStore((s) => s.toggleMenu);
  const closeMenu = useDiagramStore((s) => s.closeMenu);

  return (
    <header className="toolbar">
      <div className="toolbar__title">
        <button
          type="button"
          className="toolbar__icon-button"
          disabled={!canUndo}
          onClick={commands.undo}
          title="Undo"
          aria-label="Undo"
        >
          <HistoryArrowIcon direction="undo" />
        </button>
        <button
          type="button"
          className="toolbar__icon-button"
          disabled={!canRedo}
          onClick={commands.redo}
          title="Redo"
          aria-label="Redo"
        >
          <HistoryArrowIcon direction="redo" />
        </button>
        <span className="toolbar__divider" />
        <NameInput
          value={title}
          allowSpaces
          ariaLabel="Diagram title"
          className="toolbar__doc-input"
          onCommit={setTitle}
        />
        {dirty ? <span className="toolbar__dirty">●</span> : null}
        <span className="toolbar__divider" />
        <ToolbarMenu
          label="File"
          title="File menu (Ctrl+F)"
          open={openMenu === "file"}
          onOpenChange={(open) => (open ? toggleMenu("file") : closeMenu())}
          items={[
            { label: "New", onClick: commands.newDiagram },
            { label: "Open", onClick: () => void commands.open() },
            { label: "Save", onClick: () => void commands.save() },
          ]}
        />
        <ToolbarMenu
          label="Export"
          title="Export menu (Ctrl+E)"
          open={openMenu === "export"}
          onOpenChange={(open) => (open ? toggleMenu("export") : closeMenu())}
          items={[
            { label: "PNG", onClick: () => void commands.exportPng() },
            { label: "SVG", onClick: () => void commands.exportSvg() },
          ]}
        />
      </div>
      <div className="toolbar__actions">
        <button
          type="button"
          className="toolbar__icon-button"
          onClick={toggleTheme}
          title={
            theme === "dark"
              ? "Switch to light mode (Ctrl+T)"
              : "Switch to dark mode (Ctrl+T)"
          }
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          <ThemeToggleIcon theme={theme} />
        </button>
      </div>
    </header>
  );
}
