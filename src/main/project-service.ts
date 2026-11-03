/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { dialog, shell, type BrowserWindow } from "electron";
import {
  PROJECT_MANIFEST_FILE,
  PROJECT_SCHEMA_VERSION,
  PROJECT_SCHEMATICS_DIR,
  PROJECT_STATE_MACHINES_DIR,
  SCHEMATIC_EXTENSION,
  type ProjectManifest,
  type ProjectSchematic,
  type ProjectStateMachine,
  type ProjectSummary,
} from "../shared/project-model";
import type { FileDialogResult } from "../shared/ipc-contract";
import type { ProjectFileService } from "./project-file-service";

/** Characters Windows (the strictest platform) won't accept in a folder name. */
const UNSAFE_FOLDER_CHARS = /[<>:"/\\|?*]/g;

/**
 * Creates, opens and reads project folders (see project-model.ts for the
 * layout). Everything here is folder-level; reading an individual schematic
 * is delegated to {@link ProjectFileService}.
 */
export class ProjectService {
  /**
   * @param files - Reads the schematic files a project folder contains.
   */
  constructor(private readonly files: ProjectFileService) {}

  /**
   * Ask for a parent folder, then create `<parent>/<name>/` with a manifest
   * and empty schematics/state-machines subfolders.
   *
   * @param parent - Window the folder dialog attaches to.
   * @param name - The new project's name, also its folder name.
   * @returns The new project, or `ok: false` if the dialog was cancelled.
   * @throws {Error} If the name is unusable or the folder already exists.
   */
  async createProject(
    parent: BrowserWindow,
    name: string,
  ): Promise<FileDialogResult<ProjectSummary>> {
    const folderName = name.replace(UNSAFE_FOLDER_CHARS, "").trim();
    // "." and ".." survive the character filter but would name the chosen
    // folder itself or its parent, not a new folder inside it.
    if (folderName.length === 0 || /^\.+$/.test(folderName)) {
      throw new Error("A project name needs at least one usable character.");
    }
    const picked = await dialog.showOpenDialog(parent, {
      title: `Choose where to create "${folderName}"`,
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false };
    }

    const path = join(picked.filePaths[0], folderName);
    if (await this.exists(path)) {
      throw new Error(`A folder named "${folderName}" already exists there.`);
    }
    await mkdir(join(path, PROJECT_SCHEMATICS_DIR), { recursive: true });
    await mkdir(join(path, PROJECT_STATE_MACHINES_DIR), { recursive: true });
    const manifest: ProjectManifest = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: folderName,
      createdAt: new Date().toISOString(),
    };
    await writeFile(
      join(path, PROJECT_MANIFEST_FILE),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    return { ok: true, path, data: await this.loadProject(path) };
  }

  /**
   * Ask for a project folder and load it.
   *
   * @param parent - Window the folder dialog attaches to.
   * @returns The project, or `ok: false` if the dialog was cancelled.
   * @throws {Error} If the chosen folder isn't a project.
   */
  async openProject(
    parent: BrowserWindow,
  ): Promise<FileDialogResult<ProjectSummary>> {
    const picked = await dialog.showOpenDialog(parent, {
      title: "Open Project Folder",
      properties: ["openDirectory"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false };
    }
    const path = picked.filePaths[0];
    return { ok: true, path, data: await this.loadProject(path) };
  }

  /**
   * Read a project folder: its manifest, every schematic in it (newest
   * first), and the names of its state machines.
   *
   * @param path - Absolute path of the project folder.
   * @returns The project summary.
   * @throws {Error} If the folder has no readable manifest.
   */
  async loadProject(path: string): Promise<ProjectSummary> {
    const manifest = await this.readManifest(path);
    const schematicFiles = await this.listFiles(
      join(path, PROJECT_SCHEMATICS_DIR),
      `.${SCHEMATIC_EXTENSION}`,
    );
    const schematics: ProjectSchematic[] = [];
    for (const file of schematicFiles) {
      try {
        const [diagram, info] = await Promise.all([
          this.files.loadDiagram(file),
          stat(file),
        ]);
        schematics.push({
          path: file,
          diagram,
          modifiedAt: info.mtime.toISOString(),
        });
      } catch (error) {
        // One unreadable file shouldn't hide the rest of the project.
        console.error(`Skipping unreadable schematic ${file}:`, error);
      }
    }
    schematics.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    const stateMachines: ProjectStateMachine[] = (
      await this.listFiles(join(path, PROJECT_STATE_MACHINES_DIR), null)
    ).map((file) => ({ path: file, name: basename(file, extname(file)) }));

    return {
      path,
      name: manifest.name,
      createdAt: manifest.createdAt,
      schematics,
      stateMachines,
    };
  }

  /**
   * Move one of a project's schematics or state machines to the OS trash
   * (recoverable, unlike an outright unlink). The path comes from the
   * renderer, so it's checked to be a file sitting directly inside the
   * project's own schematics/ or state-machines/ folder before anything is
   * touched — never anywhere else on disk.
   *
   * @param projectPath - The project folder.
   * @param filePath - The file to delete.
   * @returns The project, reloaded without it.
   * @throws {Error} If the folder isn't a project, the file lies outside
   *   those two folders, or it isn't a regular file.
   */
  async deleteProjectFile(
    projectPath: string,
    filePath: string,
  ): Promise<ProjectSummary> {
    await this.readManifest(projectPath);
    const target = resolve(filePath);
    const allowedFolders = [PROJECT_SCHEMATICS_DIR, PROJECT_STATE_MACHINES_DIR]
      .map((folder) => this.comparable(resolve(projectPath, folder)));
    if (!allowedFolders.includes(this.comparable(dirname(target)))) {
      throw new Error(`"${basename(target)}" isn't part of this project.`);
    }
    const info = await stat(target);
    if (!info.isFile()) {
      throw new Error(`"${basename(target)}" isn't a file.`);
    }
    await shell.trashItem(target);
    return this.loadProject(projectPath);
  }

  /**
   * A path in the form two paths should be compared in — case-folded on the
   * case-insensitive filesystems of Windows and macOS.
   *
   * @param path - An absolute, resolved path.
   * @returns Its comparison key.
   */
  private comparable(path: string): string {
    return process.platform === "linux" ? path : path.toLowerCase();
  }

  /**
   * Read and validate a project's manifest.
   *
   * @param path - The project folder.
   * @returns The manifest.
   * @throws {Error} If it's missing or malformed.
   */
  private async readManifest(path: string): Promise<ProjectManifest> {
    let raw: string;
    try {
      raw = await readFile(join(path, PROJECT_MANIFEST_FILE), "utf-8");
    } catch (cause) {
      throw new Error(
        `"${basename(path)}" isn't an MachineMaker project (no ${PROJECT_MANIFEST_FILE}).`,
        { cause },
      );
    }
    const parsed = JSON.parse(raw) as Partial<ProjectManifest>;
    return {
      schemaVersion: parsed.schemaVersion ?? PROJECT_SCHEMA_VERSION,
      name: typeof parsed.name === "string" ? parsed.name : basename(path),
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date(0).toISOString(),
    };
  }

  /**
   * Files directly inside `folder`, optionally filtered by extension. A
   * missing folder reads as empty rather than an error — an older or
   * hand-made project may simply not have it yet.
   *
   * @param folder - The folder to list.
   * @param extension - Keep only names ending in this (e.g. ".rtlproj"), or
   *   null for every file.
   * @returns Absolute paths.
   */
  private async listFiles(
    folder: string,
    extension: string | null,
  ): Promise<string[]> {
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      return entries
        .filter(
          (entry) =>
            entry.isFile() &&
            (extension === null || entry.name.toLowerCase().endsWith(extension)),
        )
        .map((entry) => join(folder, entry.name));
    } catch {
      return [];
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
