/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import { useMemo, type RefObject } from "react";
import type { EditorCommand } from "../../../shared/ipc-contract";
import type { CanvasHandle } from "../components/DiagramCanvas";
import { SvgExporter } from "../model/svg-exporter";
import { useDiagramStore } from "./diagram-store";

/** The set of high-level editor actions, callable from menu or toolbar. */
export interface DiagramCommands {
  newDiagram(): void;
  open(): Promise<void>;
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

    /**
     * Ask the user before discarding unsaved work.
     *
     * @returns True if it is safe to proceed.
     */
    const confirmDiscard = (): boolean => {
      if (!useDiagramStore.getState().dirty) {
        return true;
      }
      return window.confirm("Discard unsaved changes?");
    };

    const save = async (): Promise<void> => {
      const { diagram, filePath, markSaved } = useDiagramStore.getState();
      const result = await window.rtl.saveDiagram({
        diagram,
        path: filePath ?? undefined,
      });
      if (result.ok && result.path) {
        markSaved(result.path);
      }
    };

    const saveAs = async (): Promise<void> => {
      const { diagram, markSaved } = useDiagramStore.getState();
      const result = await window.rtl.saveDiagram({ diagram });
      if (result.ok && result.path) {
        markSaved(result.path);
      }
    };

    const open = async (): Promise<void> => {
      if (!confirmDiscard()) {
        return;
      }
      const result = await window.rtl.openDiagram();
      if (result.ok && result.data && result.path) {
        useDiagramStore.getState().resetDocument(result.data, result.path);
        canvasRef.current?.fitView();
      }
    };

    const newDiagram = (): void => {
      if (confirmDiscard()) {
        useDiagramStore.getState().newDocument();
      }
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
        const table: Record<EditorCommand, () => void> = {
          new: newDiagram,
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
        };
        table[command]?.();
      },
    };
    return commands;
  }, [canvasRef]);
}
