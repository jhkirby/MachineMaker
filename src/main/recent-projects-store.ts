/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  MAX_RECENT_PROJECTS,
  PROJECT_MANIFEST_FILE,
  type RecentProject,
} from "../shared/project-model";

/**
 * The home page's recent-projects list, kept as a small JSON file in the
 * app's per-user data folder (not in any project, since it spans them all).
 */
export class RecentProjectsStore {
  /**
   * @param filePath - Where the list is stored, e.g.
   *   `<userData>/recent-projects.json`. Injected so tests can point it at a
   *   temp folder.
   */
  constructor(private readonly filePath: string) {}

  /**
   * The list, newest first, with any project whose folder (or manifest) no
   * longer exists dropped — and that pruning written back. Each entry's
   * creation date is filled in from its manifest.
   *
   * @returns The surviving recent projects.
   */
  async list(): Promise<RecentProject[]> {
    const all = await this.read();
    const alive: RecentProject[] = [];
    for (const entry of all) {
      const createdAt = await this.readCreatedAt(entry.path);
      if (createdAt !== null) {
        alive.push(createdAt ? { ...entry, createdAt } : entry);
      }
    }
    if (alive.length !== all.length) {
      await this.write(alive);
    }
    return alive;
  }

  /**
   * Move (or add) a project to the top of the list, trimming the oldest
   * past {@link MAX_RECENT_PROJECTS}.
   *
   * @param path - The project folder.
   * @param name - Its display name.
   */
  async touch(path: string, name: string): Promise<void> {
    const rest = (await this.read()).filter((entry) => entry.path !== path);
    await this.write(
      [{ path, name, openedAt: new Date().toISOString() }, ...rest].slice(
        0,
        MAX_RECENT_PROJECTS,
      ),
    );
  }

  /**
   * Forget one project (the folder itself is untouched).
   *
   * @param path - The project folder to drop from the list.
   * @returns The remaining list.
   */
  async remove(path: string): Promise<RecentProject[]> {
    await this.write((await this.read()).filter((entry) => entry.path !== path));
    return this.list();
  }

  /** Read the raw list; a missing or corrupt file reads as empty. */
  private async read(): Promise<RecentProject[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf-8"));
      return Array.isArray(parsed)
        ? parsed.filter(
            (entry): entry is RecentProject =>
              typeof entry?.path === "string" &&
              typeof entry?.name === "string" &&
              typeof entry?.openedAt === "string",
          )
        : [];
    } catch {
      return [];
    }
  }

  private async write(entries: RecentProject[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    // createdAt is derived from each manifest on read; never persist it.
    const stored = entries.map(({ path, name, openedAt }) => ({ path, name, openedAt }));
    await writeFile(this.filePath, JSON.stringify(stored, null, 2), "utf-8");
  }

  /**
   * A project's creation time from its manifest.
   *
   * @param projectPath - The project folder.
   * @returns The ISO time; "" if the manifest has none; null if there's no
   *   readable manifest (the project is gone).
   */
  private async readCreatedAt(projectPath: string): Promise<string | null> {
    try {
      const manifest: unknown = JSON.parse(
        await readFile(join(projectPath, PROJECT_MANIFEST_FILE), "utf-8"),
      );
      const createdAt = (manifest as { createdAt?: unknown })?.createdAt;
      return typeof createdAt === "string" ? createdAt : "";
    } catch {
      return null;
    }
  }

}
