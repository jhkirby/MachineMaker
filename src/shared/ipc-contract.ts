/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Contract shared by the preload bridge and the main-process handlers. Keeping
// the channel names and payload types in one place stops the two ends drifting.
// The editor command vocabulary lives here too, so the renderer and any future
// main-side trigger agree on the action names.

import type { BlockKind, RtlDiagram } from "./diagram-model";
import type {
  LaunchContext,
  ProjectSummary,
  RecentProject,
  TransferredDocument,
} from "./project-model";

export const IpcChannel = {
  OpenDiagram: "diagram:open",
  SaveDiagram: "diagram:save",
  ExportImage: "diagram:export-image",
  ImportSchematic: "diagram:import-schematic",
  AutosaveDiagram: "diagram:autosave",
  LoadDiagram: "diagram:load",
  CreateSchematic: "project:create-schematic",
  CreateProject: "project:create",
  OpenProject: "project:open",
  LoadProject: "project:load",
  ListRecentProjects: "project:list-recents",
  RemoveRecentProject: "project:remove-recent",
  DeleteProjectFile: "project:delete-file",
  ListRecentColors: "colors:list-recent",
  UseRecentColor: "colors:use",
  /** Main → every window push: a schematic file was just written. */
  SchematicSaved: "diagram:saved",
  /** Main → every window push: a project's recent colors changed. */
  RecentColorsChanged: "colors:recent-changed",
  GetLaunchContext: "app:get-launch-context",
  OpenEditor: "app:open-editor",
  ReturnHome: "app:return-home",
  ReportOpenDocuments: "editor:report-open-documents",
  FocusOpenDocument: "editor:focus-open-document",
  DetachTab: "editor:detach-tab",
  /** Main → editor push: take this dragged-in tab (TabAttachEvent). */
  TabAttach: "editor:tab-attach",
  /** Main → editor push: bring the tab holding this path to the front. */
  ActivateDocument: "editor:activate-document",
  /** Main → home push: show this project's page. */
  ShowProject: "home:show-project",
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
  | "toggle-mode"
  | "deselect"
  | "select-all"
  | "close-tab"
  | "close-all-tabs"
  | "go-home"
  | "focus-title"
  | `place-${BlockKind}`
  | "window-minimize"
  | "window-toggle-maximize"
  | "window-close"
  | "window-toggle-fullscreen";

/** Request payload for {@link IpcChannel.OpenDiagram}. */
export interface OpenDiagramRequest {
  /** Folder the open dialog starts in — the current project's, usually. */
  defaultPath?: string;
}

/** Request payload for {@link IpcChannel.CreateSchematic}. */
export interface CreateSchematicRequest {
  /** Project to create it in; null puts it in the loose autosave folder. */
  projectPath: string | null;
  /** The new schematic's title — also the base of its file name. */
  name: string;
  /** Starting contents (an import); omit for an empty schematic. */
  diagram?: RtlDiagram;
}

/** Request payload for {@link IpcChannel.DeleteProjectFile}. */
export interface DeleteProjectFileRequest {
  /** The project the file belongs to. */
  projectPath: string;
  /**
   * The schematic or state machine to delete — must sit directly inside
   * that project's schematics/ or state-machines/ folder.
   */
  filePath: string;
}

/** Payload of {@link IpcChannel.SchematicSaved}. */
export interface SchematicSavedEvent {
  /** Absolute path of the file written. */
  path: string;
  /** What was written to it. */
  diagram: RtlDiagram;
}

/** Payload of {@link IpcChannel.RecentColorsChanged}. */
export interface RecentColorsEvent {
  /** Whose history changed; null for the loose (no-project) one. */
  projectPath: string | null;
  /** The new history, newest first. */
  colors: string[];
}

/** Request payload for {@link IpcChannel.OpenEditor}. */
export interface OpenEditorRequest {
  projectPath: string | null;
  schematicPaths: string[];
}

/** Request payload for {@link IpcChannel.ReportOpenDocuments}. */
export interface OpenDocumentsReport {
  /** Saved paths of every tab in the reporting window. */
  paths: string[];
  /** Number of tabs, including any never saved (and so without a path). */
  tabCount: number;
}

/** Request payload for {@link IpcChannel.DetachTab}. */
export interface DetachTabRequest {
  document: TransferredDocument;
  /** Where the pointer was released, in screen coordinates (DIP). */
  screenX: number;
  screenY: number;
  /**
   * Where inside the source window the drag was grabbed, in window
   * coordinates — so a new or moved window lands with the tab under the
   * pointer rather than with its corner there.
   */
  grabX: number;
  grabY: number;
  /** Tabs in the source window, the dragged one included. */
  sourceTabCount: number;
}

/**
 * What happened to a tab dragged out of its strip: moved into another
 * window, opened in a new window, or (a window's only tab) the whole source
 * window was moved to the drop point instead.
 */
export type DetachTabResult = "attached" | "new-window" | "moved";

/** Payload of {@link IpcChannel.TabAttach}. */
export interface TabAttachEvent {
  document: TransferredDocument;
  /** Drop point in screen coordinates, for choosing the insertion index. */
  screenX: number;
}

/** Shape of the API exposed on `window.rtl` by the preload script. */
export interface RtlBridgeApi {
  openDiagram(req?: OpenDiagramRequest): Promise<FileDialogResult<RtlDiagram>>;
  /** Read one schematic file by path, with no dialog. */
  loadDiagram(path: string): Promise<RtlDiagram>;
  /** Write a new schematic file (never overwriting one) and return it. */
  createSchematic(
    req: CreateSchematicRequest,
  ): Promise<FileDialogResult<RtlDiagram>>;

  /** Ask for a parent folder, then create a project named `name` in it. */
  createProject(name: string): Promise<FileDialogResult<ProjectSummary>>;
  /** Ask for a project folder and load it. */
  openProject(): Promise<FileDialogResult<ProjectSummary>>;
  /** Load a project by path (a recent-projects entry, say), with no dialog. */
  loadProject(path: string): Promise<ProjectSummary>;
  /** Recent projects, newest first, with ones that no longer exist dropped. */
  listRecentProjects(): Promise<RecentProject[]>;
  removeRecentProject(path: string): Promise<RecentProject[]>;
  /**
   * Move one of a project's schematics or state machines to the OS trash.
   * Refused (rejects) while the file is open in an editor window.
   *
   * @returns The project, reloaded without it.
   */
  deleteProjectFile(req: DeleteProjectFileRequest): Promise<ProjectSummary>;
  /** Recently used block colors for a project (null: no project), newest first. */
  listRecentColors(projectPath: string | null): Promise<string[]>;
  /**
   * Record a block color as just used. Every window is told the new
   * history through {@link RtlBridgeApi.onRecentColorsChange}.
   */
  useRecentColor(projectPath: string | null, color: string): Promise<string[]>;
  /**
   * Subscribe to every schematic save, from any window — how a module
   * linked to a schematic hears that the schematic changed.
   */
  onSchematicSaved(callback: (event: SchematicSavedEvent) => void): () => void;
  /** Subscribe to any window's change to a recent-colors history. */
  onRecentColorsChange(callback: (event: RecentColorsEvent) => void): () => void;

  /** What this window was opened to show. */
  getLaunchContext(): Promise<LaunchContext>;
  /**
   * Open these schematics in a new editor window, alongside this one. A
   * schematic already open in some window just brings that window and tab
   * to the front instead, so no file is ever open twice.
   */
  openEditor(req: OpenEditorRequest): Promise<void>;
  /**
   * Bring up the home window on `projectPath`'s page (creating it if it was
   * closed), optionally closing this window.
   */
  returnHome(projectPath: string | null, closeThisWindow: boolean): Promise<void>;
  /** Tell the main process which documents this editor window has open. */
  reportOpenDocuments(report: OpenDocumentsReport): Promise<void>;
  /**
   * If another window already has `path` open, bring it (and that tab) to
   * the front.
   *
   * @returns True if it did — the caller shouldn't open its own copy.
   */
  focusOpenDocument(path: string): Promise<boolean>;
  /** Hand a tab dragged out of this window's strip to the main process. */
  detachTab(req: DetachTabRequest): Promise<DetachTabResult>;
  /** Subscribe to tabs dragged in from another window. */
  onTabAttach(callback: (event: TabAttachEvent) => void): () => void;
  /** Subscribe to requests to bring an already-open document forward. */
  onActivateDocument(callback: (path: string) => void): () => void;
  /** Subscribe (home window) to requests to show a project's page. */
  onShowProject(callback: (projectPath: string) => void): () => void;

  saveDiagram(req: SaveDiagramRequest): Promise<FileDialogResult<RtlDiagram>>;
  exportImage(req: ExportImageRequest): Promise<FileDialogResult<never>>;
  /** Pick a JSON or YAML schematic file and return its text. */
  importSchematic(
    format: SchematicFileFormat,
  ): Promise<FileDialogResult<ImportedSchematicFile>>;
  /**
   * Save without any dialog: to `path` when given, otherwise to a new file
   * in the user's Documents/MachineMaker folder, named after the title.
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
