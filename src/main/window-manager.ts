/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, screen, shell, type WebContents } from "electron";
import { IpcChannel, TITLEBAR_HEIGHT } from "../shared/ipc-contract";
import type { LaunchContext } from "../shared/project-model";

/** How often the cursor is sampled for titlebar hover, in milliseconds. */
const TITLEBAR_HOVER_POLL_MS = 80;

/** App icon — see resources/icon.svg for the source and how it was rendered. */
const ICON_PATH = join(__dirname, "../../resources/icon.png");

/**
 * Owns the lifecycle of every app window — the home page and any editor —
 * and remembers what each one was launched to show.
 */
/**
 * Whether a URL is one of the app's own pages — the Vite dev server in
 * development, the bundled index.html once packaged. Shared with the IPC
 * layer, which only answers calls from frames on such a page.
 *
 * @param url - The URL to check.
 * @returns True for the app's own renderer pages.
 */
export function isAppUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    return parsed.origin === new URL(devServerUrl).origin;
  }
  const appPage = pathToFileURL(join(__dirname, "../renderer/index.html"));
  return parsed.protocol === "file:" && parsed.pathname === appPage.pathname;
}

/**
 * Whether a URL is safe to hand to the OS browser.
 *
 * @param url - The URL a page tried to open.
 * @returns True only for https URLs.
 */
function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Where a new window should appear, in screen coordinates (DIP). */
export interface WindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class WindowManager {
  /** What each open window was launched to show, keyed by webContents id. */
  private readonly contexts = new Map<number, LaunchContext>();

  /**
   * Open windows, most recently focused first — the stand-in for z-order,
   * which Electron doesn't expose, when deciding which of two overlapping
   * windows a dropped tab landed on.
   */
  private focusOrder: BrowserWindow[] = [];

  /** Called with a window's webContents id after it closes. */
  private readonly closeListeners: Array<(webContentsId: number) => void> = [];

  /**
   * Create and show a window for `context` — the home page or an editor —
   * wiring the renderer entry point for both dev (Vite dev server) and
   * packaged (built HTML file) modes. Both views share one renderer bundle;
   * the URL hash picks which root it mounts (main.tsx), and the full context
   * is fetched back over IPC ({@link WindowManager.contextFor}).
   *
   * @param context - What the window should show first.
   * @param placement - Where to put it; omit to let the OS choose.
   * @returns The freshly created BrowserWindow.
   */
  createWindow(context: LaunchContext, placement?: WindowPlacement): BrowserWindow {
    const window = new BrowserWindow({
      width: placement?.width ?? 1440,
      height: placement?.height ?? 900,
      ...(placement ? { x: Math.round(placement.x), y: Math.round(placement.y) } : {}),
      minWidth: 900,
      minHeight: 600,
      backgroundColor: "#1e1f22",
      icon: ICON_PATH,
      show: false,
      frame: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        // Hardened per Electron's security checklist: the renderer gets no
        // Node, runs in Chromium's OS sandbox, and reaches the main process
        // only through the typed bridge the preload exposes.
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    const id = window.webContents.id;
    this.contexts.set(id, context);

    window.on("ready-to-show", () => window.show());
    window.on("focus", () => {
      this.focusOrder = [window, ...this.focusOrder.filter((w) => w !== window)];
    });
    this.focusOrder = [window, ...this.focusOrder];

    window.on("maximize", () =>
      window.webContents.send(IpcChannel.WindowMaximizedChanged, true),
    );
    window.on("unmaximize", () =>
      window.webContents.send(IpcChannel.WindowMaximizedChanged, false),
    );

    // No in-app popups ever; a link meant for the outside world goes to the
    // user's browser, but only if it's plain https — never file:, a custom
    // protocol handler, or anything else openExternal would happily launch.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    // The window only ever shows the app's own page; any attempt to
    // navigate it elsewhere (a dropped file, a stray link) is blocked.
    window.webContents.on("will-navigate", (event, url) => {
      if (!isAppUrl(url)) {
        event.preventDefault();
      }
    });

    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    if (devServerUrl) {
      void window.loadURL(`${devServerUrl}#${context.view}`);
    } else {
      void window.loadFile(join(__dirname, "../renderer/index.html"), {
        hash: context.view,
      });
    }

    const stopHoverWatch = this.watchTitlebarHover(window);

    window.on("closed", () => {
      stopHoverWatch();
      this.contexts.delete(id);
      this.focusOrder = this.focusOrder.filter((w) => w !== window);
      for (const listener of this.closeListeners) {
        listener(id);
      }
    });
    return window;
  }

  /**
   * Run `listener` whenever a window closes.
   *
   * @param listener - Receives the closed window's webContents id.
   */
  onWindowClosed(listener: (webContentsId: number) => void): void {
    this.closeListeners.push(listener);
  }

  /** @returns The open home window, if there is one. */
  homeWindow(): BrowserWindow | null {
    return (
      this.focusOrder.find(
        (w) => !w.isDestroyed() && this.contexts.get(w.webContents.id)?.view === "home",
      ) ?? null
    );
  }

  /**
   * The window whose webContents has this id.
   *
   * @param webContentsId - The id.
   * @returns The window, or null if it has closed.
   */
  windowById(webContentsId: number): BrowserWindow | null {
    return (
      this.focusOrder.find(
        (w) => !w.isDestroyed() && w.webContents.id === webContentsId,
      ) ?? null
    );
  }

  /**
   * The editor window whose tab strip (its titlebar row) is under a screen
   * point — where a dragged tab would attach. The topmost one wins when
   * windows overlap (approximated by focus order).
   *
   * @param x - Screen x, DIP.
   * @param y - Screen y, DIP.
   * @param exclude - A window to ignore (the drag's source).
   * @returns The window, or null if the point isn't over any tab strip.
   */
  editorStripAt(x: number, y: number, exclude: BrowserWindow): BrowserWindow | null {
    // A little vertical slack, so a drop just below the strip still counts.
    const slack = 24;
    for (const window of this.focusOrder) {
      if (
        window === exclude ||
        window.isDestroyed() ||
        !window.isVisible() ||
        window.isMinimized() ||
        this.contexts.get(window.webContents.id)?.view !== "editor"
      ) {
        continue;
      }
      const bounds = window.getContentBounds();
      const stripHeight = TITLEBAR_HEIGHT * window.webContents.getZoomFactor();
      if (
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y - slack &&
        y < bounds.y + stripHeight + slack
      ) {
        return window;
      }
    }
    return null;
  }

  /**
   * What the window owning `sender` was launched to show.
   *
   * @param sender - An IPC event's sender.
   * @returns Its launch context; a fresh editor if the window is unknown.
   */
  contextFor(sender: WebContents): LaunchContext {
    return (
      this.contexts.get(sender.id) ?? {
        view: "editor",
        projectPath: null,
        schematicPaths: [],
      }
    );
  }

  /**
   * The window owning `sender` — every IPC call acts on the window that
   * made it, now that there can be more than one.
   *
   * @param sender - An IPC event's sender.
   * @returns The window.
   * @throws {Error} If the sender has no window (it was just closed).
   */
  windowFor(sender: WebContents): BrowserWindow {
    const window = BrowserWindow.fromWebContents(sender);
    if (!window) {
      throw new Error("No application window is available for this request.");
    }
    return window;
  }

  /**
   * Tell the renderer whenever the pointer enters or leaves the titlebar,
   * which reveals/hides the window buttons (TitleBar.tsx).
   *
   * Polled from here rather than detected in the page: on Windows a
   * `-webkit-app-region: drag` area is handed to the OS as caption, so the
   * page never receives mouse events — not even :hover — while the pointer
   * is over it. The cursor's screen position is the only reliable signal.
   *
   * @param window - The window whose titlebar to watch.
   * @returns A function that stops watching.
   */
  private watchTitlebarHover(window: BrowserWindow): () => void {
    let hovered = false;
    const timer = setInterval(() => {
      if (window.isDestroyed()) {
        return;
      }
      const cursor = screen.getCursorScreenPoint();
      const bounds = window.getContentBounds();
      const zoom = window.webContents.getZoomFactor();
      const next =
        window.isVisible() &&
        !window.isMinimized() &&
        cursor.x >= bounds.x &&
        cursor.x < bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y < bounds.y + TITLEBAR_HEIGHT * zoom;
      if (next !== hovered) {
        hovered = next;
        window.webContents.send(IpcChannel.WindowTitlebarHoverChanged, next);
      }
    }, TITLEBAR_HOVER_POLL_MS);
    return () => clearInterval(timer);
  }
}
