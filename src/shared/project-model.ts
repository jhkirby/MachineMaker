/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// On-disk shape of a project, and the summaries the home page shows of one.
//
// A project is a plain folder:
//
//   <Project Name>/
//     rtl-project.json        ← the manifest (ProjectManifest)
//     schematics/*.rtlproj    ← one RtlDiagram per file
//     state-machines/         ← reserved for the state machine editor
//
// Membership is "lives in the folder", not a list kept in the manifest, so a
// schematic copied in by hand (or restored from git) shows up without the
// manifest needing to be edited to match.

import type { RtlDiagram } from "./diagram-model";

/** File name of the manifest that marks a folder as a project. */
export const PROJECT_MANIFEST_FILE = "rtl-project.json";

/** Subfolder holding a project's schematic files. */
export const PROJECT_SCHEMATICS_DIR = "schematics";

/** Subfolder reserved for a project's state machine files. */
export const PROJECT_STATE_MACHINES_DIR = "state-machines";

/** Extension of a schematic document file. */
export const SCHEMATIC_EXTENSION = "rtlproj";

/** Current manifest schema version. */
export const PROJECT_SCHEMA_VERSION = 1;

/**
 * Most colors a recent-colors history keeps — exactly the inspector's preset
 * swatch slots (COLOR_SWATCHES in block-appearance.ts), which the history
 * fills from the first slot on.
 */
export const MAX_RECENT_COLORS = 17;

/** Most documents an editor window holds open as tabs at once. */
export const MAX_EDITOR_TABS = 8;

/**
 * Most projects remembered (recent-projects.json). Every project ever
 * created or opened is kept, up to this many, so the Open Project popup can
 * list them all; the landing page shows only the newest
 * {@link RECENT_PROJECTS_SHOWN}.
 */
export const MAX_RECENT_PROJECTS = 200;

/** How many recent projects the landing page lists. */
export const RECENT_PROJECTS_SHOWN = 8;

/** Contents of {@link PROJECT_MANIFEST_FILE}. */
export interface ProjectManifest {
  schemaVersion: number;
  /** Display name — the folder name at creation, kept even if it's renamed. */
  name: string;
  /** ISO-8601 creation time. */
  createdAt: string;
  /**
   * Block colors used most recently in this project, newest first — see
   * ColorHistoryService. Absent until the first color is picked.
   */
  recentColors?: string[];
}

/** One schematic inside a project, loaded for the project page. */
export interface ProjectSchematic {
  /** Absolute path of the schematic's file. */
  path: string;
  /** The schematic itself — the page computes its stats from this. */
  diagram: RtlDiagram;
  /** Last-modified time of the file, ISO-8601. */
  modifiedAt: string;
}

/** One state machine inside a project. Listed only; no editor exists yet. */
export interface ProjectStateMachine {
  path: string;
  name: string;
}

/** Everything the project page shows about one project. */
export interface ProjectSummary {
  /** Absolute path of the project folder. */
  path: string;
  name: string;
  createdAt: string;
  schematics: ProjectSchematic[];
  stateMachines: ProjectStateMachine[];
}

/** An entry in the home page's recent-projects list. */
export interface RecentProject {
  path: string;
  name: string;
  /** ISO-8601 time the project was last opened. */
  openedAt: string;
  /**
   * ISO-8601 creation time, read from the project's manifest when the list
   * is fetched (not stored in the list, so it can't go stale). Absent if
   * the manifest has none.
   */
  createdAt?: string;
}

/**
 * One document's complete editing state, as handed from one editor window
 * to another when a tab is dragged between windows (or out into a new one)
 * — everything needed to carry on exactly where it was, undo history
 * included. Plain JSON, so it can cross IPC.
 */
export interface TransferredDocument {
  diagram: RtlDiagram;
  /** Where it's saved; null for a document that has never been written. */
  filePath: string | null;
  /** Undo stack, oldest first. */
  past: RtlDiagram[];
  /** Redo stack. */
  future: RtlDiagram[];
  /** Pan/zoom to restore; null to fit the view. */
  viewport: { x: number; y: number; zoom: number } | null;
  /** The project the document's window belonged to. */
  projectPath: string | null;
}

/** What a newly opened window should show first (see WindowManager). */
export type LaunchContext =
  | {
      view: "home";
      /** Reopen straight onto this project's page instead of the landing. */
      projectPath: string | null;
    }
  | {
      view: "editor";
      /** The project new schematics are created in; null for a loose editor. */
      projectPath: string | null;
      /** Schematic files to open as tabs, in order; empty for one untitled. */
      schematicPaths: string[];
      /** A tab dragged out of another window, to open as this one's only tab. */
      transfer?: TransferredDocument;
    };
