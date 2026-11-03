/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  MAX_RECENT_COLORS,
  PROJECT_MANIFEST_FILE,
} from "../shared/project-model";

/** A `#rrggbb` color, the only form a recent color is stored in. */
const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * The block colors used most recently, newest first — what the inspector's
 * color swatches fill up with. Kept per project, in the project's own
 * manifest (`recentColors`), so every schematic in it shares one history.
 * A loose editor with no project uses one app-wide history file instead.
 */
export class ColorHistoryService {
  /** Per-file write queue, so two quick picks can't interleave a read/write. */
  private readonly queues = new Map<string, Promise<unknown>>();

  /**
   * @param looseFilePath - History file for editors outside any project,
   *   e.g. `<userData>/recent-colors.json`. Injected for testability.
   */
  constructor(private readonly looseFilePath: string) {}

  /**
   * The history for a project (or for loose editors).
   *
   * @param projectPath - The project folder, or null for no project.
   * @returns Colors, newest first.
   */
  async list(projectPath: string | null): Promise<string[]> {
    return this.colorsFrom(await this.readJson(this.fileFor(projectPath)));
  }

  /**
   * Record a color as just used: moved (or added) to the front, the oldest
   * dropped past {@link MAX_RECENT_COLORS}. Any other manifest fields are
   * written back untouched.
   *
   * @param projectPath - The project folder, or null for no project.
   * @param color - The color used.
   * @returns The updated history, newest first.
   * @throws {TypeError} If `color` isn't a `#rrggbb` hex color.
   */
  async use(projectPath: string | null, color: string): Promise<string[]> {
    const normalized = typeof color === "string" ? color.toLowerCase() : "";
    if (!HEX_COLOR.test(normalized)) {
      throw new TypeError("color must be a #rrggbb hex color.");
    }
    const file = this.fileFor(projectPath);
    return this.serialized(file, async () => {
      const json = await this.readJson(file);
      // Only ever add to an existing project's manifest — never create one
      // in whatever folder a caller happened to name.
      if (projectPath && Object.keys(json).length === 0) {
        throw new Error("That folder isn't a MachineMaker project.");
      }
      const colors = [
        normalized,
        ...this.colorsFrom(json).filter((c) => c !== normalized),
      ].slice(0, MAX_RECENT_COLORS);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(
        file,
        JSON.stringify({ ...json, recentColors: colors }, null, 2),
        "utf-8",
      );
      return colors;
    });
  }

  /**
   * Which file holds a history: the project's manifest, or the loose file.
   *
   * @param projectPath - The project folder, or null.
   * @returns Absolute file path.
   */
  private fileFor(projectPath: string | null): string {
    return projectPath
      ? join(resolve(projectPath), PROJECT_MANIFEST_FILE)
      : this.looseFilePath;
  }

  /**
   * Read a JSON object file, treating a missing or malformed one as empty.
   *
   * @param file - The file.
   * @returns Its top-level object.
   */
  private async readJson(file: string): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf-8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  /**
   * The valid colors in a file's `recentColors`, ignoring anything else
   * a hand edit may have left there.
   *
   * @param json - The file's object.
   * @returns Colors, newest first.
   */
  private colorsFrom(json: Record<string, unknown>): string[] {
    const raw = json["recentColors"];
    return Array.isArray(raw)
      ? raw
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.toLowerCase())
          .filter((c) => HEX_COLOR.test(c))
          .slice(0, MAX_RECENT_COLORS)
      : [];
  }

  /**
   * Run one read-modify-write on a file after any already queued on it.
   *
   * @param file - The file being written.
   * @param task - The work.
   * @returns The task's result.
   */
  private serialized<T>(file: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(file, next.catch(() => undefined));
    return next;
  }
}
