/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import { expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RtlDiagram } from "../../src/shared/diagram-model";

/**
 * A throwaway directory standing in for the user's filesystem: fixture
 * documents to open, and a destination for saves and exports. Real files are
 * written and read back — only the *dialogs* are stubbed, so the main
 * process's own serialization and parsing stay under test.
 */
export class Workspace {
  /**
   * @param root - Directory to hold this test's files; created if absent.
   */
  constructor(private readonly root: string) {
    mkdirSync(this.root, { recursive: true });
  }

  /**
   * Absolute path inside the workspace, whether or not the file exists.
   *
   * @param name - File name.
   * @returns The absolute path.
   */
  path(name: string): string {
    return join(this.root, name);
  }

  /**
   * Write a diagram to disk as the app's `.rtlproj` JSON.
   *
   * @param name - File name to write.
   * @param diagram - The document to serialize.
   * @returns The absolute path written.
   */
  writeDiagram(name: string, diagram: RtlDiagram): string {
    const target = this.path(name);
    writeFileSync(target, JSON.stringify(diagram, null, 2), "utf-8");
    return target;
  }

  /**
   * Write arbitrary bytes, for fixtures that must not be valid JSON.
   *
   * @param name - File name to write.
   * @param contents - Exact file body.
   * @returns The absolute path written.
   */
  writeRaw(name: string, contents: string): string {
    const target = this.path(name);
    writeFileSync(target, contents, "utf-8");
    return target;
  }

  /**
   * Delete a file if it is there.
   *
   * @param path - Absolute path to remove.
   * @returns Nothing.
   */
  remove(path: string): void {
    rmSync(path, { force: true });
  }

  /**
   * Whether a path currently exists.
   *
   * @param path - Absolute path to check.
   * @returns True if the file is present.
   */
  exists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Read a file as text.
   *
   * @param path - Absolute path to read.
   * @returns The file's contents.
   */
  readText(path: string): string {
    return readFileSync(path, "utf-8");
  }

  /**
   * Read a file as bytes, for checking binary signatures.
   *
   * @param path - Absolute path to read.
   * @returns The file's contents.
   */
  readBytes(path: string): Buffer {
    return readFileSync(path);
  }

  /**
   * Wait for a diagram to appear at `path` and parse it. Polling rather than
   * reading once: the app writes the file from the main process after the
   * renderer's IPC call, so the write lands slightly after the click returns.
   *
   * @param path - Absolute path the app was told to save to.
   * @returns The parsed document.
   */
  async readDiagramWhenWritten(path: string): Promise<RtlDiagram> {
    await expect
      .poll(() => existsSync(path) && readFileSync(path, "utf-8").length > 0, {
        message: `Timed out waiting for the app to write ${path}`,
      })
      .toBe(true);
    return JSON.parse(readFileSync(path, "utf-8")) as RtlDiagram;
  }

  /**
   * Wait for any file the app writes (an export, say) to appear and settle.
   *
   * @param path - Absolute path the app was told to write.
   * @returns Nothing.
   */
  async waitForFile(path: string): Promise<void> {
    await expect
      .poll(() => (existsSync(path) ? readFileSync(path).length : 0), {
        message: `Timed out waiting for the app to write ${path}`,
      })
      .toBeGreaterThan(0);
  }
}
