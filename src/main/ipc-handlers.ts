/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import { IpcChannel } from "../shared/ipc-contract";
import { MAX_EDITOR_TABS } from "../shared/project-model";
import type {
  CreateSchematicRequest,
  DeleteProjectFileRequest,
  DetachTabRequest,
  DetachTabResult,
  ExportImageRequest,
  FileDialogResult,
  OpenDocumentsReport,
  TabAttachEvent,
  OpenDiagramRequest,
  OpenEditorRequest,
  RecentColorsEvent,
  SaveDiagramRequest,
  SchematicSavedEvent,
  SchematicFileFormat,
} from "../shared/ipc-contract";
import type { RtlDiagram } from "../shared/diagram-model";
import type { ColorHistoryService } from "./color-history-service";
import type { ProjectFileService } from "./project-file-service";
import type { OpenDocumentRegistry } from "./open-document-registry";
import type { ProjectService } from "./project-service";
import type { RecentProjectsStore } from "./recent-projects-store";
import { isAppUrl, type WindowManager } from "./window-manager";

/**
 * Check an IPC argument is a non-empty string before it reaches the
 * filesystem — the renderer is our own code, but a malformed call should
 * fail loudly here rather than as an obscure fs error.
 *
 * @param value - The argument to check.
 * @param what - Its name, for the error message.
 * @returns The value, typed as a string.
 * @throws {TypeError} If it isn't a non-empty string.
 */
function requireString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${what} must be a non-empty string.`);
  }
  return value;
}

/**
 * Registers the `ipcMain.handle` endpoints that back the preload bridge,
 * translating each call into a file, project or window operation scoped to
 * the window that made it.
 */
export class IpcHandlers {
  /**
   * @param windows - Opens/closes windows and resolves a sender's window.
   * @param files - Reads and writes individual schematic files.
   * @param projects - Creates and reads project folders.
   * @param recents - The home page's recent-projects list.
   * @param documents - Which documents each editor window has open.
   * @param colors - Each project's recently used block colors.
   */
  constructor(
    private readonly windows: WindowManager,
    private readonly files: ProjectFileService,
    private readonly projects: ProjectService,
    private readonly recents: RecentProjectsStore,
    private readonly documents: OpenDocumentRegistry,
    private readonly colors: ColorHistoryService,
  ) {
    windows.onWindowClosed((id) => documents.forget(id));
  }

  /**
   * Attach every handler. Call once during app startup.
   */
  register(): void {
    this.registerDocumentHandlers();
    this.registerProjectHandlers();
    this.registerWindowHandlers();
  }

  /**
   * Register one IPC endpoint that only answers the app's own pages. Every
   * handler goes through here: a call from any other frame (an injected
   * iframe, a page the window was somehow navigated to) is rejected before
   * it can touch the filesystem or a window.
   *
   * @param channel - The IPC channel.
   * @param listener - The handler, called only for trusted senders.
   */
  private handle<Args extends unknown[], Result>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      const url = event.senderFrame?.url ?? "";
      if (!isAppUrl(url)) {
        throw new Error(`Rejected IPC "${channel}" from untrusted sender ${url}`);
      }
      return listener(event, ...(args as Args));
    });
  }

  /** Schematic open/save/import/export/autosave. */
  private registerDocumentHandlers(): void {
    this.handle(
      IpcChannel.OpenDiagram,
      (event: IpcMainInvokeEvent, request?: OpenDiagramRequest) =>
        this.files.openDiagram(
          this.windows.windowFor(event.sender),
          request?.defaultPath,
        ),
    );

    this.handle(IpcChannel.LoadDiagram, (_event, path: unknown) =>
      this.files.loadDiagram(requireString(path, "path")),
    );

    this.handle(
      IpcChannel.CreateSchematic,
      async (_event, request: CreateSchematicRequest) =>
        this.announceSave(
          await this.files.createSchematic({
            ...request,
            name: requireString(request?.name, "name"),
          }),
        ),
    );

    this.handle(
      IpcChannel.SaveDiagram,
      async (event: IpcMainInvokeEvent, request: SaveDiagramRequest) =>
        this.announceSave(
          await this.files.saveDiagram(this.windows.windowFor(event.sender), request),
        ),
    );

    this.handle(
      IpcChannel.ImportSchematic,
      (event: IpcMainInvokeEvent, format: SchematicFileFormat) =>
        this.files.importSchematic(this.windows.windowFor(event.sender), format),
    );

    this.handle(
      IpcChannel.AutosaveDiagram,
      async (_event: IpcMainInvokeEvent, request: SaveDiagramRequest) =>
        this.announceSave(await this.files.autosaveDiagram(request)),
    );

    this.handle(
      IpcChannel.ExportImage,
      (event: IpcMainInvokeEvent, request: ExportImageRequest) =>
        this.files.exportImage(this.windows.windowFor(event.sender), request),
    );
  }

  /** Project create/open/load and the recent-projects list. */
  private registerProjectHandlers(): void {
    this.handle(IpcChannel.CreateProject, async (event, name: unknown) => {
      const result = await this.projects.createProject(
        this.windows.windowFor(event.sender),
        requireString(name, "name"),
      );
      if (result.ok && result.data) {
        await this.recents.touch(result.data.path, result.data.name);
      }
      return result;
    });

    this.handle(IpcChannel.OpenProject, async (event) => {
      const result = await this.projects.openProject(
        this.windows.windowFor(event.sender),
      );
      if (result.ok && result.data) {
        await this.recents.touch(result.data.path, result.data.name);
      }
      return result;
    });

    this.handle(IpcChannel.LoadProject, async (_event, path: unknown) => {
      const project = await this.projects.loadProject(
        requireString(path, "path"),
      );
      await this.recents.touch(project.path, project.name);
      return project;
    });

    this.handle(IpcChannel.ListRecentProjects, () => this.recents.list());

    this.handle(IpcChannel.RemoveRecentProject, (_event, path: unknown) =>
      this.recents.remove(requireString(path, "path")),
    );

    this.handle(IpcChannel.ListRecentColors, (_event, projectPath: unknown) =>
      this.colors.list(typeof projectPath === "string" ? projectPath : null),
    );

    this.handle(
      IpcChannel.UseRecentColor,
      async (_event, projectPath: unknown, color: unknown) => {
        const project = typeof projectPath === "string" ? projectPath : null;
        const colors = await this.colors.use(project, requireString(color, "color"));
        // Every window on this project — this one included — redraws its
        // swatches from the one shared history.
        const event: RecentColorsEvent = { projectPath: project, colors };
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IpcChannel.RecentColorsChanged, event);
        }
        return colors;
      },
    );

    this.handle(
      IpcChannel.DeleteProjectFile,
      (_event, request: DeleteProjectFileRequest) => {
        const projectPath = requireString(request?.projectPath, "projectPath");
        const filePath = requireString(request?.filePath, "filePath");
        // An editor window still holding the file would autosave it straight
        // back into existence — it has to be closed there first.
        if (this.documents.windowWith(filePath) !== null) {
          throw new Error(
            "It's open in an editor window — close its tab first, then delete it.",
          );
        }
        return this.projects.deleteProjectFile(projectPath, filePath);
      },
    );
  }

  /** Launch context, home ⇄ editor switching, and the titlebar buttons. */
  private registerWindowHandlers(): void {
    this.handle(IpcChannel.GetLaunchContext, (event) =>
      this.windows.contextFor(event.sender),
    );

    this.handle(
      IpcChannel.OpenEditor,
      (_event: IpcMainInvokeEvent, request: OpenEditorRequest) => {
        const paths = Array.isArray(request?.schematicPaths)
          ? request.schematicPaths.filter(
              (path): path is string => typeof path === "string",
            )
          : [];
        // A schematic already open somewhere is brought forward rather than
        // opened twice — two windows autosaving one file would clobber each
        // other. Only the rest get a new window.
        const unopened = paths.filter((path) => !this.focusOpenDocument(path));
        if (paths.length > 0 && unopened.length === 0) {
          return;
        }
        this.windows.createWindow({
          view: "editor",
          projectPath: request?.projectPath ?? null,
          schematicPaths: unopened,
        });
      },
    );

    this.handle(
      IpcChannel.ReturnHome,
      (event, projectPath: unknown, closeThisWindow: unknown) => {
        const project = typeof projectPath === "string" ? projectPath : null;
        const home = this.windows.homeWindow();
        if (home) {
          if (home.isMinimized()) {
            home.restore();
          }
          home.focus();
          if (project) {
            home.webContents.send(IpcChannel.ShowProject, project);
          }
        } else {
          this.windows.createWindow({ view: "home", projectPath: project });
        }
        if (closeThisWindow === true) {
          this.windows.windowFor(event.sender).close();
        }
      },
    );

    this.handle(
      IpcChannel.ReportOpenDocuments,
      (event, report: OpenDocumentsReport) => {
        this.documents.report(event.sender.id, {
          paths: Array.isArray(report?.paths)
            ? report.paths.filter((path): path is string => typeof path === "string")
            : [],
          tabCount: typeof report?.tabCount === "number" ? report.tabCount : 0,
        });
      },
    );

    this.handle(IpcChannel.FocusOpenDocument, (event, path: unknown) =>
      this.focusOpenDocument(requireString(path, "path"), event.sender.id),
    );

    this.handle(
      IpcChannel.DetachTab,
      (event, request: DetachTabRequest): DetachTabResult =>
        this.detachTab(this.windows.windowFor(event.sender), request),
    );

    this.handle(IpcChannel.WindowMinimize, (event) =>
      this.windows.windowFor(event.sender).minimize(),
    );
    this.handle(IpcChannel.WindowToggleMaximize, (event) => {
      const window = this.windows.windowFor(event.sender);
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    });
    this.handle(IpcChannel.WindowClose, (event) =>
      this.windows.windowFor(event.sender).close(),
    );
    this.handle(IpcChannel.WindowToggleFullScreen, (event) => {
      const window = this.windows.windowFor(event.sender);
      window.setFullScreen(!window.isFullScreen());
    });
    this.handle(IpcChannel.WindowIsMaximized, (event) =>
      this.windows.windowFor(event.sender).isMaximized(),
    );
  }

  /**
   * Tell every window a schematic was just written, so any module linked to
   * it (in any open document) can bring its ports back in line.
   *
   * @param result - The save's result; passed back unchanged.
   * @returns `result`.
   */
  private announceSave(
    result: FileDialogResult<RtlDiagram>,
  ): FileDialogResult<RtlDiagram> {
    if (result.ok && result.path && result.data) {
      const event: SchematicSavedEvent = { path: result.path, diagram: result.data };
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IpcChannel.SchematicSaved, event);
      }
    }
    return result;
  }

  /**
   * If some window (other than `exceptWindowId`) has `path` open, bring that
   * window and tab to the front.
   *
   * @param path - A schematic's path.
   * @param exceptWindowId - The asking window, which doesn't count.
   * @returns True if another window had it.
   */
  private focusOpenDocument(path: string, exceptWindowId?: number): boolean {
    const ownerId = this.documents.windowWith(path, exceptWindowId);
    const owner = ownerId === null ? null : this.windows.windowById(ownerId);
    if (!owner) {
      return false;
    }
    if (owner.isMinimized()) {
      owner.restore();
    }
    owner.focus();
    owner.webContents.send(IpcChannel.ActivateDocument, path);
    return true;
  }

  /**
   * Decide where a tab dragged out of `source`'s strip goes:
   *
   * - **onto another editor window's tab strip** (with room) → it moves there;
   * - **anywhere else, as `source`'s only tab** → `source` itself moves to
   *   the drop point (Chrome's behavior: dragging a lone tab drags its window);
   * - **anywhere else** → a new window opens there with it.
   *
   * Windows are placed so the grabbed spot ends up under the pointer.
   *
   * @param source - The window the tab was dragged out of.
   * @param request - The tab, drop point, and grab offset.
   * @returns What happened, so the source knows whether to drop the tab.
   */
  private detachTab(source: BrowserWindow, request: DetachTabRequest): DetachTabResult {
    const { screenX, screenY, grabX, grabY } = request;
    const target = this.windows.editorStripAt(screenX, screenY, source);
    if (target && this.documents.tabCount(target.webContents.id) < MAX_EDITOR_TABS) {
      const event: TabAttachEvent = { document: request.document, screenX };
      target.webContents.send(IpcChannel.TabAttach, event);
      if (target.isMinimized()) {
        target.restore();
      }
      target.focus();
      return "attached";
    }

    const [width, height] = source.isMaximized()
      ? [1440, 900]
      : source.getSize();
    const placement = { x: screenX - grabX, y: screenY - grabY, width, height };
    if (request.sourceTabCount <= 1) {
      if (source.isMaximized()) {
        source.unmaximize();
      }
      source.setBounds({
        x: Math.round(placement.x),
        y: Math.round(placement.y),
        width,
        height,
      });
      source.focus();
      return "moved";
    }
    this.windows.createWindow(
      {
        view: "editor",
        projectPath: request.document.projectPath,
        schematicPaths: [],
        transfer: request.document,
      },
      placement,
    );
    return "new-window";
  }
}
