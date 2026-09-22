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

import type { RtlDiagram } from "./diagram-model";

export const IpcChannel = {
  OpenDiagram: "diagram:open",
  SaveDiagram: "diagram:save",
  ExportImage: "diagram:export-image",
  WindowMinimize: "window:minimize",
  WindowToggleMaximize: "window:toggle-maximize",
  WindowClose: "window:close",
  WindowIsMaximized: "window:is-maximized",
  /** Main → renderer push, sent whenever the window's maximized state flips. */
  WindowMaximizedChanged: "window:maximized-changed",
} as const;

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

/** Image formats the exporter can write. */
export type ExportImageFormat = "png" | "svg";

/** Request payload for {@link IpcChannel.ExportImage}. */
export interface ExportImageRequest {
  format: ExportImageFormat;
  /** PNG: a `data:image/png;base64,...` URL. SVG: raw markup. */
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
  | "deselect";

/** Shape of the API exposed on `window.rtl` by the preload script. */
export interface RtlBridgeApi {
  openDiagram(): Promise<FileDialogResult<RtlDiagram>>;
  saveDiagram(req: SaveDiagramRequest): Promise<FileDialogResult<RtlDiagram>>;
  exportImage(req: ExportImageRequest): Promise<FileDialogResult<never>>;

  /** True on Windows/Linux where the app draws its own titlebar buttons. */
  platform: NodeJS.Platform;
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  /**
   * Subscribe to maximize/restore changes driven from outside the custom
   * titlebar (double-clicking the drag region, Win+Up, snap gestures).
   *
   * @param callback - Invoked with the new maximized state.
   * @returns Unsubscribe function.
   */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
}
