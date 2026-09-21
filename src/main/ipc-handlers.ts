/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-08-27
 * --------------------------------------------------------------------------- */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IpcChannel } from "../shared/ipc-contract";
import type {
  ExportImageRequest,
  SaveDiagramRequest,
} from "../shared/ipc-contract";
import type { ProjectFileService } from "./project-file-service";
import type { WindowManager } from "./window-manager";

/**
 * Registers the `ipcMain.handle` endpoints that back the preload bridge,
 * translating each call into a {@link ProjectFileService} operation scoped to
 * the current window.
 */
export class IpcHandlers {
  /**
   * @param windows - Source of the window that dialogs attach to.
   * @param files - Service that performs the actual disk work.
   */
  constructor(
    private readonly windows: WindowManager,
    private readonly files: ProjectFileService,
  ) {}

  /**
   * Attach every handler. Call once during app startup.
   */
  register(): void {
    ipcMain.handle(IpcChannel.OpenDiagram, () =>
      this.files.openDiagram(this.requireWindow()),
    );

    ipcMain.handle(
      IpcChannel.SaveDiagram,
      (_event: IpcMainInvokeEvent, request: SaveDiagramRequest) =>
        this.files.saveDiagram(this.requireWindow(), request),
    );

    ipcMain.handle(
      IpcChannel.ExportImage,
      (_event: IpcMainInvokeEvent, request: ExportImageRequest) =>
        this.files.exportImage(this.requireWindow(), request),
    );
  }

  /**
   * Fetch the current window or fail loudly.
   *
   * @returns The live BrowserWindow.
   * @throws {Error} If no window is open when an IPC call arrives.
   */
  private requireWindow() {
    const window = this.windows.getWindow();
    if (!window) {
      throw new Error("No application window is available for this request.");
    }
    return window;
  }
}
