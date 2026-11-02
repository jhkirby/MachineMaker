/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { join } from "node:path";
import { app, BrowserWindow, Menu, session } from "electron";
import type { LaunchContext } from "../shared/project-model";
import {
  appChannel,
  autosaveFolderName,
  configureDataPaths,
} from "./app-channel";
import { IpcHandlers } from "./ipc-handlers";
import { OpenDocumentRegistry } from "./open-document-registry";
import { ProjectFileService } from "./project-file-service";
import { ProjectService } from "./project-service";
import { RecentProjectsStore } from "./recent-projects-store";
import { WindowManager } from "./window-manager";

/**
 * The first window to open. The app normally starts on the home page;
 * `RTL_START_VIEW=editor` skips straight to an editor on one untitled
 * schematic — what the end-to-end tests launch with, since every spec
 * there exercises the editor rather than the home page.
 *
 * @returns The launch context for the first window.
 */
function startupContext(): LaunchContext {
  return process.env["RTL_START_VIEW"] === "editor"
    ? { view: "editor", projectPath: null, schematicPaths: [] }
    : { view: "home", projectPath: null };
}

// Before anything reads userData: dev and installed builds never share it.
configureDataPaths(app);

const windows = new WindowManager();
const fileService = new ProjectFileService(
  autosaveFolderName(appChannel(app)),
);
new IpcHandlers(
  windows,
  fileService,
  new ProjectService(fileService),
  new RecentProjectsStore(join(app.getPath("userData"), "recent-projects.json")),
  new OpenDocumentRegistry(),
).register();

Menu.setApplicationMenu(null);

void app.whenReady().then(() => {
  // The app never needs the camera, microphone, notifications, geolocation
  // or any other permission a page can request — refuse them all outright.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  windows.createWindow(startupContext());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.createWindow({ view: "home", projectPath: null });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
