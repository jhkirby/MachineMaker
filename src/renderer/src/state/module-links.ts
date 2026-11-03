/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Keeps the live document's linked modules in step with the schematics they
// link to. Linked schematics are loaded (and cached) as the document needs
// them; whenever one changes — saved in any window — every module linked to
// it here is brought back in line. A document that wasn't open while its
// linked schematic changed catches up the moment it's opened.

import { create } from "zustand";
import type { RtlDiagram } from "../../../shared/diagram-model";
import {
  isLinkedModule,
  moduleInterfaceOf,
  sameInterface,
} from "../../../shared/module-interface";
import { useDiagramStore } from "./diagram-store";
import { useTabStore } from "./tab-store";

// ── PATHS ──────────────────────────────────────────────────────────────────

/**
 * A path in comparable form: "/" separators, no trailing slash, and
 * case-folded off Linux (Windows and macOS filesystems ignore case).
 *
 * @param path - Any path.
 * @returns Its comparison key.
 */
function pathKey(path: string): string {
  const unified = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return window.rtl.platform === "linux" ? unified : unified.toLowerCase();
}

/**
 * A schematic's path relative to its project, as a link records it.
 *
 * @param projectPath - The project folder.
 * @param absolute - The schematic file.
 * @returns e.g. "schematics/ALU.rtlproj", or null if it's outside the project.
 */
export function projectRelative(projectPath: string, absolute: string): string | null {
  const root = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = absolute.replace(/\\/g, "/");
  if (!pathKey(file).startsWith(`${pathKey(root)}/`)) {
    return null;
  }
  return file.slice(root.length + 1);
}

/**
 * The absolute file a link points at.
 *
 * @param projectPath - The project folder.
 * @param relative - The link's project-relative path.
 * @returns The schematic's absolute path, in the project path's own style.
 */
export function resolveInProject(projectPath: string, relative: string): string {
  const separator = projectPath.includes("\\") ? "\\" : "/";
  return `${projectPath.replace(/[\\/]+$/, "")}${separator}${relative.replace(/\//g, separator)}`;
}

// ── CACHE ──────────────────────────────────────────────────────────────────

/** Linked schematics this window has loaded, by link path. */
interface LinkedSchematicsState {
  /**
   * Keyed by {@link pathKey} of the project-relative path. A diagram once
   * loaded; null when the file is gone (deleted, or never existed). A path
   * not yet loaded has no entry.
   */
  byPath: Record<string, RtlDiagram | null>;
}

export const useLinkedSchematics = create<LinkedSchematicsState>(() => ({
  byPath: {},
}));

/**
 * The linked schematic a link path points at, as far as this window knows.
 *
 * @param byPath - The cache (from {@link useLinkedSchematics}).
 * @param relative - A link's project-relative path.
 * @returns The schematic; null if its file is missing; undefined if it
 *   hasn't been loaded yet.
 */
export function linkedSchematic(
  byPath: LinkedSchematicsState["byPath"],
  relative: string,
): RtlDiagram | null | undefined {
  return byPath[pathKey(relative)];
}

/**
 * Remember a linked schematic's current contents.
 *
 * @param relative - Its project-relative path.
 * @param diagram - Its contents, or null if the file is gone.
 */
export function cacheLinkedSchematic(relative: string, diagram: RtlDiagram | null): void {
  useLinkedSchematics.setState((state) => ({
    byPath: { ...state.byPath, [pathKey(relative)]: diagram },
  }));
}

// ── SYNC ───────────────────────────────────────────────────────────────────

/**
 * Bring every module linked to one schematic into line with it, if the
 * schematic's interface has moved on from what those modules recorded.
 *
 * @param relative - The schematic's project-relative path.
 * @param diagram - Its current contents.
 */
function syncTo(relative: string, diagram: RtlDiagram): void {
  const linked = useDiagramStore
    .getState()
    .diagram.blocks.filter(
      (block) =>
        isLinkedModule(block) &&
        pathKey(block.linkedModule!.path!) === pathKey(relative),
    );
  // Links record the path exactly as written when they were made; keep
  // that spelling (it's what the store matches on) rather than this one.
  for (const stored of new Set(linked.map((block) => block.linkedModule!.path!))) {
    const definition = moduleInterfaceOf(diagram, stored);
    const stale = linked.some(
      (block) =>
        block.linkedModule!.path === stored &&
        !sameInterface(block.linkedModule!, definition),
    );
    if (stale) {
      useDiagramStore.getState().syncLinkedModules(stored, definition);
    }
  }
}

/**
 * The link paths the live document's modules use.
 *
 * @returns Project-relative paths, deduplicated.
 */
function linkedPaths(): string[] {
  const paths = useDiagramStore
    .getState()
    .diagram.blocks.filter(isLinkedModule)
    .map((block) => block.linkedModule!.path!);
  return [...new Map(paths.map((path) => [pathKey(path), path])).values()];
}

/**
 * Load every schematic the live document links to (fresh from disk) and
 * re-sync any module whose schematic changed while it wasn't looking.
 */
async function refreshLinks(): Promise<void> {
  const projectPath = useTabStore.getState().projectPath;
  if (!projectPath) {
    return;
  }
  // Direct links first (these are what this document's modules sync to),
  // then whatever those link to in turn — the simulator runs modules all
  // the way down, so it needs the whole tree loaded.
  const queue = linkedPaths();
  const seen = new Set(queue.map(pathKey));
  const direct = new Set(seen);
  while (queue.length > 0) {
    const relative = queue.shift()!;
    let diagram: RtlDiagram | null;
    try {
      diagram = await window.rtl.loadDiagram(resolveInProject(projectPath, relative));
    } catch {
      diagram = null;
    }
    cacheLinkedSchematic(relative, diagram);
    if (!diagram) {
      continue;
    }
    if (direct.has(pathKey(relative))) {
      syncTo(relative, diagram);
    }
    for (const block of diagram.blocks) {
      const nested = isLinkedModule(block) ? block.linkedModule!.path! : null;
      if (nested && !seen.has(pathKey(nested))) {
        seen.add(pathKey(nested));
        queue.push(nested);
      }
    }
  }
}

/**
 * Start keeping the window's linked modules in sync: refresh now, again
 * whenever the live document (or the set of schematics it links to)
 * changes, and on every schematic save broadcast from any window. Call
 * once at the editor's root.
 *
 * @returns Unsubscribe function.
 */
export function startModuleLinkSync(): () => void {
  const signature = () =>
    `${useDiagramStore.getState().filePath ?? ""}|${linkedPaths().map(pathKey).sort().join(",")}`;
  let last = signature();
  void refreshLinks();

  const stopStore = useDiagramStore.subscribe(() => {
    const next = signature();
    if (next !== last) {
      last = next;
      void refreshLinks();
    }
  });

  const stopSaves = window.rtl.onSchematicSaved(({ path, diagram }) => {
    const projectPath = useTabStore.getState().projectPath;
    const relative = projectPath ? projectRelative(projectPath, path) : null;
    if (!relative) {
      return;
    }
    cacheLinkedSchematic(relative, diagram);
    syncTo(relative, diagram);
  });

  return () => {
    stopStore();
    stopSaves();
  };
}
