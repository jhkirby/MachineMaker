/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-01
 * --------------------------------------------------------------------------- */

import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel } from "../shared/ipc-contract";
import type {
  ExportImageRequest,
  RtlBridgeApi,
  SaveDiagramRequest,
} from "../shared/ipc-contract";

// The only surface the renderer gets. No Node primitives leak past this file.
const api: RtlBridgeApi = {
  openDiagram: () => ipcRenderer.invoke(IpcChannel.OpenDiagram),
  saveDiagram: (request: SaveDiagramRequest) =>
    ipcRenderer.invoke(IpcChannel.SaveDiagram, request),
  exportImage: (request: ExportImageRequest) =>
    ipcRenderer.invoke(IpcChannel.ExportImage, request),

  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke(IpcChannel.WindowMinimize),
  windowToggleMaximize: () =>
    ipcRenderer.invoke(IpcChannel.WindowToggleMaximize),
  windowClose: () => ipcRenderer.invoke(IpcChannel.WindowClose),
  isWindowMaximized: () => ipcRenderer.invoke(IpcChannel.WindowIsMaximized),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) =>
      callback(maximized);
    ipcRenderer.on(IpcChannel.WindowMaximizedChanged, listener);
    return () =>
      ipcRenderer.removeListener(IpcChannel.WindowMaximizedChanged, listener);
  },
};

contextBridge.exposeInMainWorld("rtl", api);
