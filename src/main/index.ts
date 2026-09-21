/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-01
 * --------------------------------------------------------------------------- */

import { app, BrowserWindow, Menu } from "electron";
import { IpcHandlers } from "./ipc-handlers";
import { ProjectFileService } from "./project-file-service";
import { WindowManager } from "./window-manager";

// Composition root: wire the collaborators once, then hand control to Electron.
const windows = new WindowManager();
const fileService = new ProjectFileService();
new IpcHandlers(windows, fileService).register();

// No native menu bar — the renderer owns the toolbar and its keyboard chords.
Menu.setApplicationMenu(null);

void app.whenReady().then(() => {
  windows.createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
