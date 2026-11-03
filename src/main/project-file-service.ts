/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-08-27
 * --------------------------------------------------------------------------- */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import {
  createEmptyDiagram,
  DIAGRAM_SCHEMA_VERSION,
  type RtlDiagram,
} from "../shared/diagram-model";
import { PROJECT_SCHEMATICS_DIR } from "../shared/project-model";
import type {
  CreateSchematicRequest,
  ExportImageRequest,
  FileDialogResult,
  ImportedSchematicFile,
  SaveDiagramRequest,
  SchematicFileFormat,
} from "../shared/ipc-contract";

const DIAGRAM_EXTENSION = "rtlproj";

/** Folder under the user's Documents that new, never-saved diagrams
 *  autosave into. */
const AUTOSAVE_FOLDER = "MachineMaker";

/** File extensions accepted for each importable schematic format. */
const SCHEMATIC_EXTENSIONS: Record<SchematicFileFormat, string[]> = {
  json: ["json"],
  yaml: ["yaml", "yml"],
};

/**
 * All disk access for the app: open/save of `.rtlproj` documents and export of
 * rendered images. Every method takes the parent window explicitly so dialogs
 * stay modal to it and the class holds no global state.
 */
export class ProjectFileService {
  /**
   * @param autosaveFolder - Folder name, under Documents, for schematics
   *   that aren't in a project — per channel, so dev and installed builds
   *   never write into each other's (see app-channel.ts).
   */
  constructor(private readonly autosaveFolder: string = AUTOSAVE_FOLDER) {}

  /**
   * Prompt for a `.rtlproj` file and load it.
   *
   * @param parent - Window the open dialog attaches to.
   * @returns The parsed diagram and its path, or `{ ok: false }` on cancel.
   */
  async openDiagram(
    parent: BrowserWindow,
    defaultPath?: string,
  ): Promise<FileDialogResult<RtlDiagram>> {
    const picked = await dialog.showOpenDialog(parent, {
      title: "Open RTL Diagram",
      defaultPath,
      properties: ["openFile"],
      filters: [{ name: "RTL Diagram", extensions: [DIAGRAM_EXTENSION] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false };
    }

    const path = picked.filePaths[0];
    const raw = await readFile(path, "utf-8");
    const diagram = this.parseDiagram(raw);
    return { ok: true, path, data: diagram };
  }

  /**
   * Write a diagram to disk, prompting for a location when none is supplied.
   *
   * @param parent - Window the save dialog attaches to.
   * @param request - The diagram plus an optional existing path to overwrite.
   * @returns The path written, or `{ ok: false }` on cancel.
   */
  async saveDiagram(
    parent: BrowserWindow,
    request: SaveDiagramRequest,
  ): Promise<FileDialogResult<RtlDiagram>> {
    let path = request.path;
    if (!path) {
      const picked = await dialog.showSaveDialog(parent, {
        title: "Save RTL Diagram",
        defaultPath: `${this.sanitizeName(request.diagram.title)}.${DIAGRAM_EXTENSION}`,
        filters: [{ name: "RTL Diagram", extensions: [DIAGRAM_EXTENSION] }],
      });
      if (picked.canceled || !picked.filePath) {
        return { ok: false };
      }
      path = picked.filePath;
    }

    const document: RtlDiagram = {
      ...request.diagram,
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
    };
    await writeFile(path, JSON.stringify(document, null, 2), "utf-8");
    return { ok: true, path, data: document };
  }

  /**
   * Save a diagram with no dialog — the autosave path. A diagram that
   * already has a file is written there; a new one gets a fresh file in
   * Documents/MachineMaker, named after its title (numbered if taken).
   *
   * @param request - The diagram plus its existing path, if any.
   * @returns The path written.
   */
  async autosaveDiagram(
    request: SaveDiagramRequest,
  ): Promise<FileDialogResult<RtlDiagram>> {
    let path = request.path;
    if (!path) {
      const folder = join(app.getPath("documents"), this.autosaveFolder);
      await mkdir(folder, { recursive: true });
      const base = this.sanitizeName(request.diagram.title);
      path = join(folder, `${base}.${DIAGRAM_EXTENSION}`);
      for (let n = 2; await this.exists(path); n++) {
        path = join(folder, `${base} ${n}.${DIAGRAM_EXTENSION}`);
      }
    }
    const document: RtlDiagram = {
      ...request.diagram,
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
    };
    await writeFile(path, JSON.stringify(document, null, 2), "utf-8");
    return { ok: true, path, data: document };
  }

  /**
   * Prompt for a JSON or YAML schematic file and read it. Parsing happens
   * in the renderer (schematic-iac.ts), which owns the block model.
   *
   * @param parent - Window the open dialog attaches to.
   * @param format - Which kind of file to offer.
   * @returns The file's text, or `{ ok: false }` on cancel.
   */
  async importSchematic(
    parent: BrowserWindow,
    format: SchematicFileFormat,
  ): Promise<FileDialogResult<ImportedSchematicFile>> {
    const picked = await dialog.showOpenDialog(parent, {
      title: `Import ${format.toUpperCase()} Schematic`,
      properties: ["openFile"],
      filters: [
        { name: `${format.toUpperCase()} Schematic`, extensions: SCHEMATIC_EXTENSIONS[format] },
      ],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false };
    }
    const path = picked.filePaths[0];
    return { ok: true, path, data: { format, text: await readFile(path, "utf-8") } };
  }

  /**
   * Prompt for a destination and write an export: a PNG image, or the text
   * of an SVG or a JSON/YAML schematic.
   *
   * @param parent - Window the save dialog attaches to.
   * @param request - Format, file content, and a suggested base name.
   * @returns The path written, or `{ ok: false }` on cancel.
   */
  async exportImage(
    parent: BrowserWindow,
    request: ExportImageRequest,
  ): Promise<FileDialogResult<never>> {
    const picked = await dialog.showSaveDialog(parent, {
      title: `Export ${request.format.toUpperCase()}`,
      defaultPath: `${this.sanitizeName(request.suggestedName)}.${request.format}`,
      filters: [
        { name: request.format.toUpperCase(), extensions: [request.format] },
      ],
    });
    if (picked.canceled || !picked.filePath) {
      return { ok: false };
    }

    if (request.format === "png") {
      const base64 = request.content.replace(/^data:image\/png;base64,/, "");
      await writeFile(picked.filePath, Buffer.from(base64, "base64"));
    } else {
      await writeFile(picked.filePath, request.content, "utf-8");
    }
    return { ok: true, path: picked.filePath };
  }

  /**
   * Parse and validate raw JSON into a diagram document.
   *
   * @param raw - File contents read from disk.
   * @returns A well-formed diagram.
   * @throws {Error} If the JSON is malformed or missing required arrays.
   */
  private parseDiagram(raw: string): RtlDiagram {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error("File is not valid JSON.", { cause });
    }

    const candidate = parsed as Partial<RtlDiagram>;
    if (!Array.isArray(candidate.blocks) || !Array.isArray(candidate.wires)) {
      throw new Error("File is missing the 'blocks' or 'wires' array.");
    }
    return {
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
      title: typeof candidate.title === "string" ? candidate.title : "Untitled Schematic",
      blocks: candidate.blocks,
      wires: candidate.wires,
    };
  }

  /**
   * Whether a file already exists at a path.
   *
   * @param path - The path to check.
   * @returns True if something is there.
   */
  /**
   * Read one schematic file by path, with no dialog.
   *
   * @param path - Absolute path of the `.rtlproj` file.
   * @returns The parsed diagram.
   * @throws {Error} If the file can't be read or isn't a valid diagram.
   */
  async loadDiagram(path: string): Promise<RtlDiagram> {
    return this.parseDiagram(await readFile(path, "utf-8"));
  }

  /**
   * Write a brand-new schematic file named after `request.name`, numbering
   * it ("Name 2", "Name 3", ...) rather than ever overwriting an existing
   * file. Goes in the project's schematics folder, or the loose autosave
   * folder when there's no project.
   *
   * @param request - Where, what it's called, and optional starting content.
   * @returns The written diagram and the path it landed at.
   */
  async createSchematic(
    request: CreateSchematicRequest,
  ): Promise<FileDialogResult<RtlDiagram>> {
    const folder = request.projectPath
      ? join(request.projectPath, PROJECT_SCHEMATICS_DIR)
      : join(app.getPath("documents"), this.autosaveFolder);
    await mkdir(folder, { recursive: true });
    const base = this.sanitizeName(request.name);
    let path = join(folder, `${base}.${DIAGRAM_EXTENSION}`);
    for (let n = 2; await this.exists(path); n++) {
      path = join(folder, `${base} ${n}.${DIAGRAM_EXTENSION}`);
    }
    const document: RtlDiagram = {
      ...(request.diagram ?? createEmptyDiagram()),
      title: request.name,
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
    };
    // "wx": fail rather than clobber, should a file appear between the
    // existence check above and this write.
    await writeFile(path, JSON.stringify(document, null, 2), {
      encoding: "utf-8",
      flag: "wx",
    });
    return { ok: true, path, data: document };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reduce an arbitrary title to something safe for a file name.
   *
   * @param name - The raw title or suggested name.
   * @returns A trimmed name with filesystem-hostile characters removed.
   */
  private sanitizeName(name: string): string {
    const cleaned = basename(name).replace(/[<>:"/\\|?* -]/g, "").trim();
    return cleaned.length > 0 ? cleaned : "diagram";
  }
}
