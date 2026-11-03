/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import type { ElectronApplication } from "@playwright/test";

/** What a stubbed dialog should answer with. `null` means the user cancelled. */
export type DialogAnswer = string | null;

/** One recorded dialog invocation, as the app asked for it. */
export interface DialogCall {
  kind: "open" | "save";
  /** The options object the app passed (title, defaultPath, filters, …). */
  options: { title?: string; defaultPath?: string };
}

/**
 * Replaces Electron's native file dialogs with scripted answers.
 *
 * Native dialogs are modal OS windows that Playwright cannot drive, so they are
 * the one genuinely uncontrollable dependency in this app — everything else
 * (the real store, the real renderer, the real file writes) runs untouched.
 * Each stub also records the options it was called with, so tests can assert on
 * what the app *asked* for, e.g. the sanitized default file name.
 */
export class MainProcessDialogs {
  /**
   * @param app - The launched Electron application to patch.
   */
  constructor(private readonly app: ElectronApplication) {}

  /**
   * Install both dialog stubs, replacing any previously installed answers.
   *
   * @param answers.open - Path the open dialog returns, or null to cancel.
   * @param answers.save - Path the save dialog returns, or null to cancel.
   * @returns Resolves once the main process is patched.
   */
  async stub(answers: { open?: DialogAnswer; save?: DialogAnswer }): Promise<void> {
    await this.app.evaluate(({ dialog }, plan) => {
      const scope = globalThis as unknown as { __rtlDialogCalls?: unknown[] };
      scope.__rtlDialogCalls ??= [];
      const calls = scope.__rtlDialogCalls;

      // Overwriting the methods on the `dialog` singleton reaches the app's
      // already-imported binding too — ProjectFileService holds the same
      // object, not a copy of its methods.
      Object.assign(dialog, {
        showOpenDialog: async (_parent: unknown, options: unknown) => {
          calls.push({ kind: "open", options });
          return plan.open === null || plan.open === undefined
            ? { canceled: true, filePaths: [] }
            : { canceled: false, filePaths: [plan.open] };
        },
        showSaveDialog: async (_parent: unknown, options: unknown) => {
          calls.push({ kind: "save", options });
          return plan.save === null || plan.save === undefined
            ? { canceled: true, filePath: undefined }
            : { canceled: false, filePath: plan.save };
        },
      });
    }, answers as { open?: DialogAnswer; save?: DialogAnswer });
  }

  /**
   * Every dialog the app has opened so far, oldest first.
   *
   * @returns The recorded calls.
   */
  async calls(): Promise<DialogCall[]> {
    return this.app.evaluate(() => {
      const scope = globalThis as unknown as { __rtlDialogCalls?: DialogCall[] };
      return scope.__rtlDialogCalls ?? [];
    }) as Promise<DialogCall[]>;
  }

  /**
   * The most recent dialog invocation.
   *
   * @returns The last recorded call, or undefined if none has happened.
   */
  async lastCall(): Promise<DialogCall | undefined> {
    const calls = await this.calls();
    return calls[calls.length - 1];
  }

  /**
   * Forget every recorded call, leaving the installed answers in place.
   *
   * @returns Resolves once the log is cleared.
   */
  async clearCalls(): Promise<void> {
    await this.app.evaluate(() => {
      const scope = globalThis as unknown as { __rtlDialogCalls?: unknown[] };
      scope.__rtlDialogCalls = [];
    });
  }
}
