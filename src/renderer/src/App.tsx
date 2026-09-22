/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import ComponentPalette from "./components/ComponentPalette";
import DiagramCanvas, { type CanvasHandle } from "./components/DiagramCanvas";
import InspectorPanel from "./components/InspectorPanel";
import TitleBar from "./components/TitleBar";
import Toolbar from "./components/Toolbar";
import { useDiagramStore } from "./state/diagram-store";
import { useDiagramCommands } from "./state/use-diagram-commands";
import { useKeyboardShortcuts } from "./state/use-keyboard-shortcuts";

/**
 * Root component: fixed three-column layout (palette · canvas · inspector) with
 * the toolbar on top. Installs the editor's global keyboard shortcuts.
 *
 * @returns The application shell.
 */
export default function App() {
  const canvasRef = useRef<CanvasHandle>(null);
  const commands = useDiagramCommands(canvasRef);

  const title = useDiagramStore((s) => s.diagram.title);
  const dirty = useDiagramStore((s) => s.dirty);
  const theme = useDiagramStore((s) => s.theme);
  const paletteCollapsed = useDiagramStore((s) => s.paletteCollapsed);
  const hasSelection = useDiagramStore(
    (s) => s.selection.blockIds.length > 0 || s.selection.wireIds.length > 0,
  );

  useEffect(() => {
    document.title = `${dirty ? "● " : ""}${title} — RTL Schematic`;
  }, [title, dirty]);

  // Every token in tokens.css is re-defined under `:root[data-theme="light"]`,
  // so flipping this one attribute repaints the whole app — see the toolbar's
  // day/night toggle (Toolbar.tsx) for where `theme` actually changes.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useKeyboardShortcuts(commands);

  return (
    <div className="app">
      <TitleBar />
      <Toolbar commands={commands} />
      <div
        className={`app__body${
          paletteCollapsed ? " app__body--palette-collapsed" : ""
        }${hasSelection ? " app__body--inspector-open" : ""}`}
      >
        <ComponentPalette />
        <DiagramCanvas ref={canvasRef} />
        <InspectorPanel />
      </div>
    </div>
  );
}
