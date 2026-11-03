/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel } from "../shared/ipc-contract";
import type {
  CreateSchematicRequest,
  DeleteProjectFileRequest,
  DetachTabRequest,
  OpenDocumentsReport,
  TabAttachEvent,
  ExportImageRequest,
  OpenDiagramRequest,
  OpenEditorRequest,
  RecentColorsEvent,
  RtlBridgeApi,
  SchematicSavedEvent,
  SaveDiagramRequest,
  SchematicFileFormat,
} from "../shared/ipc-contract";

// The only surface the renderer gets. No Node primitives leak past this file.
/**
 * Listen on a main → renderer push channel, handing the callback only the
 * payload (never Electron's event object, which would leak `sender` into
 * the page).
 *
 * @param channel - The push channel.
 * @param callback - Receives each payload.
 * @returns Unsubscribe function.
 */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: RtlBridgeApi = {
  openDiagram: (request?: OpenDiagramRequest) =>
    ipcRenderer.invoke(IpcChannel.OpenDiagram, request),
  loadDiagram: (path: string) => ipcRenderer.invoke(IpcChannel.LoadDiagram, path),
  createSchematic: (request: CreateSchematicRequest) =>
    ipcRenderer.invoke(IpcChannel.CreateSchematic, request),
  createProject: (name: string) =>
    ipcRenderer.invoke(IpcChannel.CreateProject, name),
  openProject: () => ipcRenderer.invoke(IpcChannel.OpenProject),
  loadProject: (path: string) => ipcRenderer.invoke(IpcChannel.LoadProject, path),
  listRecentProjects: () => ipcRenderer.invoke(IpcChannel.ListRecentProjects),
  removeRecentProject: (path: string) =>
    ipcRenderer.invoke(IpcChannel.RemoveRecentProject, path),
  deleteProjectFile: (request: DeleteProjectFileRequest) =>
    ipcRenderer.invoke(IpcChannel.DeleteProjectFile, request),
  listRecentColors: (projectPath: string | null) =>
    ipcRenderer.invoke(IpcChannel.ListRecentColors, projectPath),
  useRecentColor: (projectPath: string | null, color: string) =>
    ipcRenderer.invoke(IpcChannel.UseRecentColor, projectPath, color),
  onSchematicSaved: (callback: (event: SchematicSavedEvent) => void) =>
    subscribe(IpcChannel.SchematicSaved, callback),
  onRecentColorsChange: (callback: (event: RecentColorsEvent) => void) =>
    subscribe(IpcChannel.RecentColorsChanged, callback),
  getLaunchContext: () => ipcRenderer.invoke(IpcChannel.GetLaunchContext),
  openEditor: (request: OpenEditorRequest) =>
    ipcRenderer.invoke(IpcChannel.OpenEditor, request),
  returnHome: (projectPath: string | null, closeThisWindow: boolean) =>
    ipcRenderer.invoke(IpcChannel.ReturnHome, projectPath, closeThisWindow),
  reportOpenDocuments: (report: OpenDocumentsReport) =>
    ipcRenderer.invoke(IpcChannel.ReportOpenDocuments, report),
  focusOpenDocument: (path: string) =>
    ipcRenderer.invoke(IpcChannel.FocusOpenDocument, path),
  detachTab: (request: DetachTabRequest) =>
    ipcRenderer.invoke(IpcChannel.DetachTab, request),
  onTabAttach: (callback: (event: TabAttachEvent) => void) =>
    subscribe(IpcChannel.TabAttach, callback),
  onActivateDocument: (callback: (path: string) => void) =>
    subscribe(IpcChannel.ActivateDocument, callback),
  onShowProject: (callback: (projectPath: string) => void) =>
    subscribe(IpcChannel.ShowProject, callback),
  saveDiagram: (request: SaveDiagramRequest) =>
    ipcRenderer.invoke(IpcChannel.SaveDiagram, request),
  exportImage: (request: ExportImageRequest) =>
    ipcRenderer.invoke(IpcChannel.ExportImage, request),
  importSchematic: (format: SchematicFileFormat) =>
    ipcRenderer.invoke(IpcChannel.ImportSchematic, format),
  autosaveDiagram: (request: SaveDiagramRequest) =>
    ipcRenderer.invoke(IpcChannel.AutosaveDiagram, request),

  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke(IpcChannel.WindowMinimize),
  windowToggleMaximize: () =>
    ipcRenderer.invoke(IpcChannel.WindowToggleMaximize),
  windowClose: () => ipcRenderer.invoke(IpcChannel.WindowClose),
  windowToggleFullScreen: () =>
    ipcRenderer.invoke(IpcChannel.WindowToggleFullScreen),
  isWindowMaximized: () => ipcRenderer.invoke(IpcChannel.WindowIsMaximized),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) =>
      callback(maximized);
    ipcRenderer.on(IpcChannel.WindowMaximizedChanged, listener);
    return () =>
      ipcRenderer.removeListener(IpcChannel.WindowMaximizedChanged, listener);
  },
  onTitlebarHoverChange: (callback: (hovered: boolean) => void) => {
    const listener = (_event: unknown, hovered: boolean) => callback(hovered);
    ipcRenderer.on(IpcChannel.WindowTitlebarHoverChanged, listener);
    return () =>
      ipcRenderer.removeListener(
        IpcChannel.WindowTitlebarHoverChanged,
        listener,
      );
  },
};

contextBridge.exposeInMainWorld("rtl", api);
