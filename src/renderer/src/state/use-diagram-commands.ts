/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useMemo, type RefObject } from "react";
import type { EditorCommand } from "../../../shared/ipc-contract";
import type { CanvasHandle } from "../components/DiagramCanvas";
import {
  parseSchematic,
  serializeSchematic,
  type SchematicFormat,
} from "../model/schematic-iac";
import { SvgExporter } from "../model/svg-exporter";
import { saveNow } from "./use-autosave";
import { useDiagramStore } from "./diagram-store";

/** The set of high-level editor actions, callable from menu or toolbar. */
export interface DiagramCommands {
  newDiagram(): Promise<void>;
  open(): Promise<void>;
  /** Placeholder until state machines exist; does nothing yet. */
  newStateMachine(): void;
  /** Placeholder until state machines exist; does nothing yet. */
  openStateMachine(): void;
  /** Build a new diagram from a JSON/YAML schematic file. */
  importSchematic(format: SchematicFormat): Promise<void>;
  /** Write the diagram as a JSON/YAML schematic file. */
  exportSchematic(format: SchematicFormat): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  exportPng(): Promise<void>;
  exportSvg(): Promise<void>;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  fitView(): void;
  toggleGrid(): void;
  toggleTheme(): void;
  zoomIn(): void;
  zoomOut(): void;
  toggleLock(): void;
  toggleFileMenu(): void;
  toggleExportMenu(): void;
  togglePalette(): void;
  deselect(): void;
  /** Route a command name (from a keyboard chord) to the matching action. */
  run(command: EditorCommand): void;
}

/**
 * Build the editor command set. File I/O goes through the preload bridge;
 * everything else is a thin call into the diagram store or the canvas ref.
 *
 * @param canvasRef - Ref to the canvas, for actions needing React Flow.
 * @returns A stable {@link DiagramCommands} object.
 */
export function useDiagramCommands(
  canvasRef: RefObject<CanvasHandle | null>,
): DiagramCommands {
  return useMemo<DiagramCommands>(() => {
    const svgExporter = new SvgExporter();

    // Diagrams autosave (use-autosave.ts), so there's never work to
    // discard: switching documents just flushes the pending save first.
    const save = saveNow;

    const saveAs = async (): Promise<void> => {
      const { diagram, markSaved } = useDiagramStore.getState();
      const result = await window.rtl.saveDiagram({ diagram });
      if (result.ok && result.path) {
        markSaved(result.path);
      }
    };

    const open = async (): Promise<void> => {
      await saveNow();
      const result = await window.rtl.openDiagram();
      if (result.ok && result.data && result.path) {
        useDiagramStore.getState().resetDocument(result.data, result.path);
        canvasRef.current?.fitView();
      }
    };

    const newDiagram = async (): Promise<void> => {
      await saveNow();
      useDiagramStore.getState().newDocument();
    };

    const newStateMachine = (): void => undefined;
    const openStateMachine = (): void => undefined;

    const importSchematic = async (format: SchematicFormat): Promise<void> => {
      const result = await window.rtl.importSchematic(format);
      if (!result.ok || !result.data) {
        return;
      }
      let diagram;
      try {
        diagram = parseSchematic(result.data.text, result.data.format);
      } catch (error) {
        window.alert(
          `Couldn't import that file.

${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      await saveNow();
      const store = useDiagramStore.getState();
      store.resetDocument(diagram, null);
      // A brand-new document that only exists in memory — mark it changed
      // so autosave gives it a file right away.
      useDiagramStore.setState({ dirty: true, diagram: { ...diagram } });
      canvasRef.current?.fitView();
    };

    const exportSchematic = async (format: SchematicFormat): Promise<void> => {
      const { diagram } = useDiagramStore.getState();
      await window.rtl.exportImage({
        format,
        content: serializeSchematic(diagram, format),
        suggestedName: diagram.title,
      });
    };

    const exportSvg = async (): Promise<void> => {
      const { diagram, theme } = useDiagramStore.getState();
      await window.rtl.exportImage({
        format: "svg",
        content: svgExporter.export(diagram, theme),
        suggestedName: diagram.title,
      });
    };

    const exportPng = async (): Promise<void> => {
      const dataUrl = await canvasRef.current?.exportPng();
      if (!dataUrl) {
        return;
      }
      await window.rtl.exportImage({
        format: "png",
        content: dataUrl,
        suggestedName: useDiagramStore.getState().diagram.title,
      });
    };

    const undo = (): void => useDiagramStore.getState().undo();
    const redo = (): void => useDiagramStore.getState().redo();
    const deleteSelection = (): void =>
      useDiagramStore.getState().deleteSelection();
    // "P" while exactly one block is selected — the same default (a new
    // input on the left) the inspector's own "+ Port" button adds.
    const addPortToSelection = (): void => {
      const { selection, addPort } = useDiagramStore.getState();
      if (selection.blockIds.length !== 1 || selection.wireIds.length > 0) {
        return;
      }
      addPort(selection.blockIds[0], "left", "in");
    };
    const fitView = (): void => canvasRef.current?.fitView();
    const toggleGrid = (): void => useDiagramStore.getState().toggleGrid();
    const toggleTheme = (): void => useDiagramStore.getState().toggleTheme();
    const zoomIn = (): void => canvasRef.current?.zoomIn();
    const zoomOut = (): void => canvasRef.current?.zoomOut();
    const toggleLock = (): void => canvasRef.current?.toggleLock();
    const toggleFileMenu = (): void =>
      useDiagramStore.getState().toggleMenu("file");
    const toggleExportMenu = (): void =>
      useDiagramStore.getState().toggleMenu("export");
    const togglePalette = (): void =>
      useDiagramStore.getState().togglePalette();
    const deselect = (): void =>
      useDiagramStore.getState().setSelection({ blockIds: [], wireIds: [] });

    const commands: DiagramCommands = {
      newDiagram,
      open,
      newStateMachine,
      openStateMachine,
      importSchematic,
      exportSchematic,
      save,
      saveAs,
      exportPng,
      exportSvg,
      undo,
      redo,
      deleteSelection,
      fitView,
      toggleGrid,
      toggleTheme,
      zoomIn,
      zoomOut,
      toggleLock,
      toggleFileMenu,
      toggleExportMenu,
      togglePalette,
      deselect,
      run: (command) => {
        const togglePlacing = useDiagramStore.getState().togglePlacingKind;
        const table: Record<EditorCommand, () => void> = {
          new: () => void newDiagram(),
          open: () => void open(),
          save: () => void save(),
          "save-as": () => void saveAs(),
          "export-png": () => void exportPng(),
          "export-svg": () => void exportSvg(),
          undo,
          redo,
          "delete-selection": deleteSelection,
          "add-port": addPortToSelection,
          "fit-view": fitView,
          "toggle-grid": toggleGrid,
          "toggle-theme": toggleTheme,
          "zoom-in": zoomIn,
          "zoom-out": zoomOut,
          "toggle-lock": toggleLock,
          "toggle-file-menu": toggleFileMenu,
          "toggle-export-menu": toggleExportMenu,
          "toggle-palette": togglePalette,
          deselect,
          // The title field lives in the toolbar's own tree; reaching it by
          // its accessible label avoids threading a ref through App.
          "place-module": () => togglePlacing("module"),
          "place-register": () => togglePlacing("register"),
          "place-gate": () => togglePlacing("gate"),
          "place-io": () => togglePlacing("io"),
          "place-constant": () => togglePlacing("constant"),
          "focus-title": () => {
            const field = document.querySelector<HTMLInputElement>(
              'input[aria-label="Diagram title"]',
            );
            field?.focus();
            field?.select();
          },
          "window-minimize": () => void window.rtl.windowMinimize(),
          "window-toggle-maximize": () =>
            void window.rtl.windowToggleMaximize(),
          "window-close": () => void window.rtl.windowClose(),
          "window-toggle-fullscreen": () =>
            void window.rtl.windowToggleFullScreen(),
        };
        table[command]?.();
      },
    };
    return commands;
  }, [canvasRef]);
}
