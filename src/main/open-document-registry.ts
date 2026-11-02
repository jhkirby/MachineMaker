/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { normalize } from "node:path";
import type { OpenDocumentsReport } from "../shared/ipc-contract";

/**
 * Which documents each editor window has open, as last reported by that
 * window (tab-store.ts reports on every tab change). Lets the main process
 * keep a file open in at most one window — two windows autosaving the same
 * file would silently overwrite each other's edits — and know how full each
 * window's tab strip is when a tab is dragged onto it.
 *
 * Keyed by webContents id; plain data, no Electron dependency, so it can be
 * unit-tested directly.
 */
export class OpenDocumentRegistry {
  private readonly byWindow = new Map<number, OpenDocumentsReport>();

  /**
   * Record a window's current tabs, replacing its previous report.
   *
   * @param windowId - The reporting window's webContents id.
   * @param report - Its open paths and tab count.
   */
  report(windowId: number, report: OpenDocumentsReport): void {
    this.byWindow.set(windowId, {
      paths: report.paths.map((path) => this.key(path)),
      tabCount: report.tabCount,
    });
  }

  /**
   * Forget a window (it closed).
   *
   * @param windowId - Its webContents id.
   */
  forget(windowId: number): void {
    this.byWindow.delete(windowId);
  }

  /**
   * The window that has `path` open, if any.
   *
   * @param path - A schematic's path.
   * @param exceptWindowId - Ignore this window (usually the one asking).
   * @returns The owning window's webContents id, or null.
   */
  windowWith(path: string, exceptWindowId?: number): number | null {
    const wanted = this.key(path);
    for (const [windowId, report] of this.byWindow) {
      if (windowId !== exceptWindowId && report.paths.includes(wanted)) {
        return windowId;
      }
    }
    return null;
  }

  /**
   * How many tabs a window has (0 for one that hasn't reported yet).
   *
   * @param windowId - Its webContents id.
   * @returns The tab count.
   */
  tabCount(windowId: number): number {
    return this.byWindow.get(windowId)?.tabCount ?? 0;
  }

  /**
   * Compare paths by their normalized form — and case-insensitively on the
   * case-insensitive filesystems of Windows and macOS, where `C:\A.rtlproj`
   * and `c:\a.rtlproj` are the same file.
   *
   * @param path - A path.
   * @returns Its comparison key.
   */
  private key(path: string): string {
    const normalized = normalize(path);
    return process.platform === "linux" ? normalized : normalized.toLowerCase();
  }
}
