/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-01
 * --------------------------------------------------------------------------- */

import { join } from "node:path";
import { BrowserWindow, screen, shell } from "electron";
import { IpcChannel, TITLEBAR_HEIGHT } from "../shared/ipc-contract";

/** How often the cursor is sampled for titlebar hover, in milliseconds. */
const TITLEBAR_HOVER_POLL_MS = 80;

/** App icon — see resources/icon.svg for the source and how it was rendered. */
const ICON_PATH = join(__dirname, "../../resources/icon.png");

/**
 * Owns the lifecycle of the single main application window.
 */
export class WindowManager {
  private window: BrowserWindow | null = null;

  /**
   * Create and show the main window, wiring the renderer entry point for both
   * dev (Vite dev server) and packaged (built HTML file) modes.
   *
   * @returns The freshly created BrowserWindow.
   */
  createMainWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: "#1e1f22",
      icon: ICON_PATH,
      show: false,
      // No native chrome — the renderer draws its own titlebar (TitleBar.tsx)
      // so the window controls can match the app's own theme.
      frame: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    window.on("ready-to-show", () => window.show());

    // The renderer's controls only mirror this state (e.g. after a snap
    // gesture or double-clicking the drag region), it never owns it.
    window.on("maximize", () =>
      window.webContents.send(IpcChannel.WindowMaximizedChanged, true),
    );
    window.on("unmaximize", () =>
      window.webContents.send(IpcChannel.WindowMaximizedChanged, false),
    );

    // Open target="_blank" / external links in the OS browser, never in-app.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    if (devServerUrl) {
      void window.loadURL(devServerUrl);
    } else {
      void window.loadFile(join(__dirname, "../renderer/index.html"));
    }

    const stopHoverWatch = this.watchTitlebarHover(window);

    this.window = window;
    window.on("closed", () => {
      stopHoverWatch();
      this.window = null;
    });
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

  /**
   * Return the live main window, or null if none is currently open.
   *
   * @returns The current BrowserWindow or null.
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }
}
