/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useCallback, useEffect, useState } from "react";
import type {
  ProjectSummary,
  RecentProject,
} from "../../../../shared/project-model";
import { useDiagramStore } from "../../state/diagram-store";
import { requestName } from "../../state/name-prompt-store";
import { formatDate, relativeTime } from "../../model/project-stats";
import ListPickerDialog from "../ListPickerDialog";
import NamePromptDialog from "../NamePromptDialog";
import TitleBar from "../TitleBar";
import TypedDeleteDialog from "../TypedDeleteDialog";
import CircuitBackdrop from "./CircuitBackdrop";
import LandingView from "./LandingView";
import type { ProjectFileItem } from "./ProjectFileSection";
import ProjectView, { type ProjectFileKind } from "./ProjectView";

/** A project file waiting on the type-DELETE popup. */
interface PendingFileDelete {
  kind: ProjectFileKind;
  item: ProjectFileItem;
}

/**
 * Describe a failed IPC call for the error banner.
 *
 * @param error - Whatever was thrown.
 * @returns A readable message, without Electron's IPC prefix.
 */
function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/**
 * Root of the home window: the landing page (logo, New/Open Project,
 * recents) and, once a project is chosen, that project's page. Opening a
 * schematic hands off to an editor window, which replaces this one.
 *
 * @returns The home page.
 */
export default function HomeApp() {
  const theme = useDiagramStore((s) => s.theme);
  const toggleTheme = useDiagramStore((s) => s.toggleTheme);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingFileDelete | null>(
    null,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = project ? `${project.name} — MachineMaker` : "MachineMaker";
  }, [project]);

  /**
   * Run one home-page action with the buttons disabled and any failure
   * shown in the error banner rather than lost to the console.
   */
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, []);

  // A window opened by "return home" lands back on the project it came from.
  useEffect(() => {
    void run(async () => {
      const [context, list] = await Promise.all([
        window.rtl.getLaunchContext(),
        window.rtl.listRecentProjects(),
      ]);
      setRecents(list);
      if (context.view === "home" && context.projectPath) {
        setProject(await window.rtl.loadProject(context.projectPath));
      }
    });
  }, [run]);

  // An editor's home button (or its last tab closing) brings this window
  // forward on that editor's project.
  useEffect(
    () =>
      window.rtl.onShowProject((projectPath) => {
        void run(async () => setProject(await window.rtl.loadProject(projectPath)));
      }),
    [run],
  );

  const newProject = () =>
    void run(async () => {
      const name = await requestName({
        title: "New Project",
        initialValue: "Untitled Project",
        submitLabel: "Choose Folder…",
      });
      if (!name) {
        return;
      }
      const result = await window.rtl.createProject(name);
      if (result.ok && result.data) {
        setProject(result.data);
      }
    });

  // Open Project lists every known project in a popup; its folder button
  // falls back to the OS folder picker for one not in the list yet.
  const openProject = () =>
    void run(async () => {
      setRecents(await window.rtl.listRecentProjects());
      setPickerOpen(true);
    });

  const browseForProject = () =>
    void run(async () => {
      setPickerOpen(false);
      const result = await window.rtl.openProject();
      if (result.ok && result.data) {
        setProject(result.data);
      }
    });

  const pickProject = (path: string) => {
    setPickerOpen(false);
    openRecent(path);
  };

  const openRecent = (path: string) =>
    void run(async () => setProject(await window.rtl.loadProject(path)));

  const forgetRecent = (path: string) =>
    void run(async () => setRecents(await window.rtl.removeRecentProject(path)));

  const backToLanding = () =>
    void run(async () => {
      setProject(null);
      setRecents(await window.rtl.listRecentProjects());
    });

  const openSchematic = (path: string) =>
    void run(async () => {
      if (project) {
        await window.rtl.openEditor({
          projectPath: project.path,
          schematicPaths: [path],
        });
      }
    });

  const newSchematic = () =>
    void run(async () => {
      if (!project) {
        return;
      }
      const name = await requestName({
        title: "New Schematic",
        initialValue: "Untitled Schematic",
        submitLabel: "Create",
      });
      if (!name) {
        return;
      }
      const result = await window.rtl.createSchematic({
        projectPath: project.path,
        name,
      });
      if (result.ok && result.path) {
        await window.rtl.openEditor({
          projectPath: project.path,
          schematicPaths: [result.path],
        });
      }
    });

  const confirmDelete = () => {
    const request = pendingDelete;
    setPendingDelete(null);
    void run(async () => {
      if (project && request) {
        setProject(
          await window.rtl.deleteProjectFile({
            projectPath: project.path,
            filePath: request.item.path,
          }),
        );
      }
    });
  };

  return (
    <div className="home">
      <TitleBar />
      <main className="home__stage">
        <CircuitBackdrop />
        <button
          type="button"
          className="home-icon-button home__theme-toggle"
          data-hover-fx="spin-half"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="3.1" />
              <path d="M8 0.75V2.5M8 13.5v1.75M15.25 8h-1.75M2.5 8H0.75M12.77 3.23l-1.24 1.24M4.47 11.53l-1.24 1.24M12.77 12.77l-1.24-1.24M4.47 4.47 3.23 3.23" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.5 9.5A5.75 5.75 0 0 1 6.5 2.5a5.75 5.75 0 1 0 7 7z" />
            </svg>
          )}
        </button>
        <div className="home__content">
          {error ? (
            <div className="home__error" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="home__error-dismiss"
                aria-label="Dismiss"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </div>
          ) : null}
          {project ? (
            <ProjectView
              key={project.path}
              project={project}
              busy={busy}
              onBack={backToLanding}
              onNewSchematic={newSchematic}
              onOpenSchematic={openSchematic}
              onDeleteFile={(kind, item) => setPendingDelete({ kind, item })}
            />
          ) : (
            <LandingView
              recents={recents}
              busy={busy}
              onNewProject={newProject}
              onOpenProject={openProject}
              onOpenRecent={openRecent}
              onForgetRecent={forgetRecent}
            />
          )}
        </div>
      </main>
      <NamePromptDialog />
      {pendingDelete ? (
        <TypedDeleteDialog
          key={pendingDelete.item.path}
          title={`Delete ${pendingDelete.item.name}?`}
          detail={`This ${pendingDelete.kind} will be moved to the ${
            window.rtl.platform === "win32" ? "Recycle Bin" : "trash"
          }.`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
      {pickerOpen ? (
        <ListPickerDialog
          title="Open Project"
          searchPlaceholder="Search projects"
          browseLabel="Browse for a project folder"
          emptyText="No projects yet. Use the folder button to open one from disk."
          items={recents.map((recent) => ({
            key: recent.path,
            name: recent.name,
            path: recent.path,
            details: [
              { label: "Created", value: formatDate(recent.createdAt) },
              { label: "Opened", value: relativeTime(recent.openedAt) },
            ],
          }))}
          onPick={(item) => pickProject(item.key)}
          onBrowse={browseForProject}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
