/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Contract shared by the preload bridge and the main-process handlers. Keeping
// the channel names and payload types in one place stops the two ends drifting.
// The editor command vocabulary lives here too, so the renderer and any future
// main-side trigger agree on the action names.

import type { BlockKind, RtlDiagram } from "./diagram-model";

export const IpcChannel = {
  OpenDiagram: "diagram:open",
  SaveDiagram: "diagram:save",
  ExportImage: "diagram:export-image",
  ImportSchematic: "diagram:import-schematic",
  AutosaveDiagram: "diagram:autosave",
  WindowMinimize: "window:minimize",
  WindowToggleMaximize: "window:toggle-maximize",
  WindowClose: "window:close",
  WindowToggleFullScreen: "window:toggle-full-screen",
  WindowIsMaximized: "window:is-maximized",
  /** Main → renderer push, sent whenever the window's maximized state flips. */
  WindowMaximizedChanged: "window:maximized-changed",
  /** Main → renderer push, sent whenever the pointer enters/leaves the titlebar. */
  WindowTitlebarHoverChanged: "window:titlebar-hover-changed",
} as const;

/**
 * Height of the custom titlebar in CSS pixels — must match
 * `--titlebar-height` in tokens.css. The main process needs it to tell when
 * the pointer is over the bar (see WindowManager.watchTitlebarHover).
 */
export const TITLEBAR_HEIGHT = 32;

/** Result of an open/save dialog flow. */
export interface FileDialogResult<T> {
  /** False when the user cancelled the dialog. */
  ok: boolean;
  /** Absolute path chosen by the user, when {@link ok} is true. */
  path?: string;
  /** Payload loaded from disk (open only). */
  data?: T;
}

/** Request payload for {@link IpcChannel.SaveDiagram}. */
export interface SaveDiagramRequest {
  diagram: RtlDiagram;
  /** Existing path to overwrite; omit to prompt for a location. */
  path?: string;
}

/** Formats the exporter can write: two images, two schematic-as-code texts. */
export type ExportImageFormat = "png" | "svg" | "json" | "yaml";

/** Text formats a schematic can be imported from (schematic-iac.ts). */
export type SchematicFileFormat = "json" | "yaml";

/** A schematic file picked for import: its text, parsed in the renderer. */
export interface ImportedSchematicFile {
  format: SchematicFileFormat;
  text: string;
}

/** Request payload for {@link IpcChannel.ExportImage}. */
export interface ExportImageRequest {
  format: ExportImageFormat;
  /** PNG: a `data:image/png;base64,...` URL. Anything else: the file's text. */
  content: string;
  /** Suggested file name without extension. */
  suggestedName: string;
}

/** High-level editor actions, triggered from the toolbar or a keyboard chord. */
export type EditorCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "export-png"
  | "export-svg"
  | "undo"
  | "redo"
  | "delete-selection"
  | "add-port"
  | "fit-view"
  | "toggle-grid"
  | "toggle-theme"
  | "zoom-in"
  | "zoom-out"
  | "toggle-lock"
  | "toggle-file-menu"
  | "toggle-export-menu"
  | "toggle-palette"
  | "deselect"
  | "focus-title"
  | `place-${BlockKind}`
  | "window-minimize"
  | "window-toggle-maximize"
  | "window-close"
  | "window-toggle-fullscreen";

/** Shape of the API exposed on `window.rtl` by the preload script. */
export interface RtlBridgeApi {
  openDiagram(): Promise<FileDialogResult<RtlDiagram>>;
  saveDiagram(req: SaveDiagramRequest): Promise<FileDialogResult<RtlDiagram>>;
  exportImage(req: ExportImageRequest): Promise<FileDialogResult<never>>;
  /** Pick a JSON or YAML schematic file and return its text. */
  importSchematic(
    format: SchematicFileFormat,
  ): Promise<FileDialogResult<ImportedSchematicFile>>;
  /**
   * Save without any dialog: to `path` when given, otherwise to a new file
   * in the user's Documents/RTL Schematic folder, named after the title.
   */
  autosaveDiagram(req: SaveDiagramRequest): Promise<FileDialogResult<RtlDiagram>>;

  /** True on Windows/Linux where the app draws its own titlebar buttons. */
  platform: NodeJS.Platform;
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  windowToggleFullScreen(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  /**
   * Subscribe to maximize/restore changes driven from outside the custom
   * titlebar (double-clicking the drag region, Win+Up, snap gestures).
   *
   * @param callback - Invoked with the new maximized state.
   * @returns Unsubscribe function.
   */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
  /**
   * Subscribe to the pointer entering or leaving the custom titlebar.
   *
   * @param callback - Invoked with true on enter, false on leave.
   * @returns Unsubscribe function.
   */
  onTitlebarHoverChange(callback: (hovered: boolean) => void): () => void;
}
