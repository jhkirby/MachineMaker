/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Keeps development and installed (production) MachineMaker from ever
// sharing data on the same machine. Everything the app persists lives under
// one of two roots — Electron's userData folder (recent projects, theme and
// other localStorage, caches) and a Documents folder for loose autosaves —
// and both get a distinct name per channel. Must run before anything reads
// app.getPath("userData"), i.e. first thing in main/index.ts.

import { join } from "node:path";
import type { App } from "electron";

/** Which build is running. */
export type AppChannel = "prod" | "dev";

/** Product name; also the production data folder names. */
const PRODUCT_NAME = "MachineMaker";

/**
 * The running channel: an installed (packaged) app is production; running
 * from source (`npm run dev`, the test suite) is development.
 *
 * @param app - Electron's app object.
 * @returns The channel.
 */
export function appChannel(app: Pick<App, "isPackaged">): AppChannel {
  return app.isPackaged ? "prod" : "dev";
}

/**
 * Folder name, under the user's Documents, for schematics that aren't in a
 * project (see ProjectFileService.autosaveDiagram).
 *
 * @param channel - The running channel.
 * @returns "MachineMaker" or "MachineMaker Dev".
 */
export function autosaveFolderName(channel: AppChannel): string {
  return channel === "prod" ? PRODUCT_NAME : `${PRODUCT_NAME} Dev`;
}

/**
 * Point Electron's per-user data folder at the channel's own location.
 *
 * Production uses `<appData>/MachineMaker`; development uses
 * `<appData>/MachineMaker Dev`. Both are set explicitly rather than left to
 * Electron's default, which derives the folder from package.json's `name`
 * ("machinemaker") for *both* builds — and on Windows' and macOS's
 * case-insensitive filesystems, any spelling of that is one shared folder.
 *
 * `MACHINEMAKER_USER_DATA` overrides both — the test suite uses it to give
 * every run a throwaway folder.
 *
 * @param app - Electron's app object.
 * @param env - The process environment (injected for testability).
 */
export function configureDataPaths(
  app: Pick<App, "isPackaged" | "getPath" | "setPath">,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const override = env["MACHINEMAKER_USER_DATA"];
  if (override) {
    app.setPath("userData", override);
    return;
  }
  const folder = appChannel(app) === "prod" ? PRODUCT_NAME : `${PRODUCT_NAME} Dev`;
  app.setPath("userData", join(app.getPath("appData"), folder));
}
