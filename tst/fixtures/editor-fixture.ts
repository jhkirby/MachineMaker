/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Every spec starts from a freshly launched Electron app with an empty
// document, its native file dialogs scripted, and a private temp directory to
// read and write. Nothing is shared between tests but the built bundle.

import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { resolve } from "node:path";
import { EditorPage } from "../helpers/editor-page";
import { MainProcessDialogs } from "../helpers/main-dialogs";
import { Workspace } from "../helpers/workspace";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MAIN_ENTRY = resolve(REPO_ROOT, "out", "main", "index.js");

/** Fixtures every spec in this suite can pull in. */
export interface EditorFixtures {
  /** The running Electron application (main process). */
  app: ElectronApplication;
  /** The editor window's renderer page. */
  page: Page;
  /** Scripted answers for the native open/save dialogs. */
  dialogs: MainProcessDialogs;
  /** Temp directory standing in for the user's filesystem. */
  workspace: Workspace;
  /** Page object for driving the editor UI. */
  editor: EditorPage;
}

export const test = base.extend<EditorFixtures>({
  workspace: async ({}, use, testInfo) => {
    await use(new Workspace(testInfo.outputPath("workspace")));
  },

  app: async ({}, use) => {
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: REPO_ROOT,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      executablePath: require("electron") as unknown as string,
    });
    await use(app);
    await app.close();
  },

  page: async ({ app }, use) => {
    const window = await app.firstWindow();
    // No default dialog handler: the editor guards destructive actions with
    // window.confirm, and Playwright auto-dismisses an unhandled dialog — the
    // safe answer, since dismissing means "keep my unsaved work". A spec that
    // wants the guard accepted registers its own one-shot handler; registering
    // a second listener for an already-answered dialog would throw.
    await window.waitForSelector(".app");
    await use(window);
  },

  dialogs: async ({ app }, use) => {
    const dialogs = new MainProcessDialogs(app);
    // Default to "user cancelled" so a dialog nobody scripted can never write
    // a file somewhere outside the workspace.
    await dialogs.stub({ open: null, save: null });
    await use(dialogs);
  },

  editor: async ({ page, dialogs, workspace }, use) => {
    const editor = new EditorPage(page, dialogs, workspace);
    await editor.waitForReady();
    await use(editor);
  },
});

export { expect };
