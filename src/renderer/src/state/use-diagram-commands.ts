/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
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
import type { RtlDiagram } from "../../../shared/diagram-model";
import { saveNow } from "./use-autosave";
import { useDiagramStore } from "./diagram-store";
import { requestName } from "./name-prompt-store";
import { openSchematicPicker } from "./schematic-picker-store";
import { closeTab, openInNewTab, tabsFull, useTabStore } from "./tab-store";

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

    // New, Open and Import never replace the current document: each opens
    // its result in a new tab (tab-store.ts), and does nothing once the
    // window is at its tab limit (the File menu disables them then, too).
    const open = async (): Promise<void> => {
      if (!tabsFull()) {
        openSchematicPicker();
      }
    };

    /**
     * Create a schematic file (in the project, if there is one) and open it
     * in a new tab.
     *
     * @param name - Its title.
     * @param diagram - Starting contents; omit for an empty schematic.
     */
    const createInNewTab = async (
      name: string,
      diagram?: RtlDiagram,
    ): Promise<void> => {
      const { projectPath } = useTabStore.getState();
      const result = await window.rtl.createSchematic({
        projectPath,
        name,
        diagram,
      });
      if (result.ok && result.data && result.path) {
        await openInNewTab(result.data, result.path);
      }
    };

    const newDiagram = async (): Promise<void> => {
      if (tabsFull()) {
        return;
      }
      const name = await requestName({
        title: "New Schematic",
        initialValue: "Untitled Schematic",
        submitLabel: "Create",
      });
      if (name) {
        await createInNewTab(name);
      }
    };

    const newStateMachine = (): void => undefined;
    const openStateMachine = (): void => undefined;

    const importSchematic = async (format: SchematicFormat): Promise<void> => {
      if (tabsFull()) {
        return;
      }
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
      await createInNewTab(diagram.title, diagram);
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
    // Components go through the type-DELETE popup first; a wire-only
    // selection is deleted straight away (see requestDeleteSelection).
    const deleteSelection = (): void =>
      useDiagramStore.getState().requestDeleteSelection();
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
    // Ctrl+W: the current tab, or the whole window when it's the last one
    // (closeTab's own last-tab path would also send the user home; Ctrl+W
    // on a single tab means just "close this window").
    const closeCurrentTab = async (): Promise<void> => {
      const { tabs, activeId } = useTabStore.getState();
      if (tabs.length > 1) {
        await closeTab(activeId);
        return;
      }
      await saveNow();
      await window.rtl.windowClose();
    };

    // Ctrl+Shift+W: every tab, and so the window, bringing home forward.
    const closeAllTabs = async (): Promise<void> => {
      await saveNow();
      await window.rtl.returnHome(useTabStore.getState().projectPath, true);
    };

    // Ctrl+H: the home window, opened if it was closed. This window stays.
    const goHome = async (): Promise<void> => {
      await saveNow();
      await window.rtl.returnHome(useTabStore.getState().projectPath, false);
    };

    const deselect = (): void =>
      useDiagramStore.getState().setSelection({ blockIds: [], wireIds: [] });
    // Every component and wire on the canvas — the toolbar's Select All
    // button and Ctrl+A.
    const selectAll = (): void => {
      const { diagram, setSelection } = useDiagramStore.getState();
      setSelection({
        blockIds: diagram.blocks.map((block) => block.id),
        wireIds: diagram.wires.map((wire) => wire.id),
      });
    };

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
          "select-all": selectAll,
          "close-tab": () => void closeCurrentTab(),
          "close-all-tabs": () => void closeAllTabs(),
          "go-home": () => void goHome(),
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
