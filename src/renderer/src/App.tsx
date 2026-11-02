/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import ComponentPalette from "./components/ComponentPalette";
import DeleteConfirmDialog from "./components/DeleteConfirmDialog";
import NamePromptDialog from "./components/NamePromptDialog";
import SchematicPickerDialog from "./components/SchematicPickerDialog";
import TabBar from "./components/TabBar";
import DiagramCanvas, { type CanvasHandle } from "./components/DiagramCanvas";
import InspectorPanel from "./components/InspectorPanel";
import StatusBar from "./components/StatusBar";
import TitleBar from "./components/TitleBar";
import Toolbar from "./components/Toolbar";
import TooltipLayer from "./components/TooltipLayer";
import { useDiagramStore } from "./state/diagram-store";
import { useAutosave } from "./state/use-autosave";
import { useDiagramCommands } from "./state/use-diagram-commands";
import { useKeyboardShortcuts } from "./state/use-keyboard-shortcuts";
import {
  activateTabByPath,
  attachTab,
  initTabs,
  registerTabCanvas,
  reportOpenDocumentsOnChange,
} from "./state/tab-store";

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
    document.title = `${dirty ? "● " : ""}${title} — MachineMaker`;
  }, [title, dirty]);

  // Every token in tokens.css is re-defined under `:root[data-theme="light"]`,
  // so flipping this one attribute repaints the whole app — see the toolbar's
  // day/night toggle (Toolbar.tsx) for where `theme` actually changes.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useKeyboardShortcuts(commands);
  useAutosave();

  // Tab switching saves/restores each document's pan and zoom through the
  // canvas; the handle is stable for the window's lifetime.
  useEffect(() => {
    registerTabCanvas(canvasRef.current);
    return () => registerTabCanvas(null);
  }, []);

  // Keep the main process told what this window has open, and answer its
  // two requests: take a tab dragged in from another window, and bring an
  // already-open document forward rather than letting it open twice.
  useEffect(() => {
    const unsubscribes = [
      reportOpenDocumentsOnChange(),
      window.rtl.onTabAttach(({ document, screenX }) =>
        void attachTab(document, screenX),
      ),
      window.rtl.onActivateDocument((path) => void activateTabByPath(path)),
    ];
    return () => unsubscribes.forEach((off) => off());
  }, []);

  // Open whatever this window was launched with (the home page picks the
  // project and schematic) as tabs.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const context = await window.rtl.getLaunchContext();
      if (context.view !== "editor" || cancelled) {
        return;
      }
      const documents = [];
      for (const path of context.schematicPaths) {
        try {
          documents.push({ path, diagram: await window.rtl.loadDiagram(path) });
        } catch (error) {
          console.error(`Couldn't open ${path}:`, error);
        }
      }
      if (!cancelled) {
        initTabs(context.projectPath, documents, context.transfer);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <TitleBar>
        <TabBar />
      </TitleBar>
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
      <StatusBar />
      <TooltipLayer />
      {/* Both portal themselves to <body>, outside the app root they make
          inert while open (Modal.tsx). */}
      <DeleteConfirmDialog />
      <NamePromptDialog />
      <SchematicPickerDialog />
    </div>
  );
}
