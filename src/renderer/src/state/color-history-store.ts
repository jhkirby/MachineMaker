/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { create } from "zustand";
import { COLOR_SWATCHES } from "../model/block-appearance";
import { useTabStore } from "./tab-store";

/**
 * The inspector's color swatch slots: the recently used colors first,
 * newest in the top-left, then the presets filling whatever's left, with
 * nothing listed twice. A project with no history yet shows exactly the
 * presets.
 *
 * @param recent - Recently used colors, newest first.
 * @returns Exactly as many colors as there are preset slots.
 */
export function swatchSlots(recent: readonly string[]): string[] {
  const seen = new Set<string>();
  const slots: string[] = [];
  for (const color of [...recent, ...COLOR_SWATCHES]) {
    const key = color.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      slots.push(key);
    }
  }
  return slots.slice(0, COLOR_SWATCHES.length);
}

/**
 * Whether two project paths name the same project — case-insensitively off
 * Linux, and ignoring which slash Windows paths were written with.
 *
 * @param a - A project path, or null for no project.
 * @param b - Another.
 * @returns True if they're the same.
 */
function sameProject(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const key = (path: string) => {
    const unified = path.replace(/\\/g, "/").replace(/\/+$/, "");
    return window.rtl.platform === "linux" ? unified : unified.toLowerCase();
  };
  return key(a) === key(b);
}

/** This editor window's view of its project's recent-colors history. */
interface ColorHistoryStore {
  /** Recently used colors, newest first. */
  recent: string[];
  /** Load the history for the window's current project. */
  load(): Promise<void>;
  /** Record a color as just used — for the whole project, every window. */
  use(color: string): void;
}

export const useColorHistoryStore = create<ColorHistoryStore>((set) => ({
  recent: [],

  load: async () => {
    const projectPath = useTabStore.getState().projectPath;
    try {
      set({ recent: await window.rtl.listRecentColors(projectPath) });
    } catch (error) {
      // The presets still work without a history; just say why it's missing.
      console.error("Couldn't load recent colors:", error);
    }
  },

  use: (raw) => {
    const color = raw.toLowerCase();
    const projectPath = useTabStore.getState().projectPath;
    // Shown straight away; main's broadcast (below) then confirms it here
    // and brings every other window on the project up to date.
    set((state) => ({
      recent: [color, ...state.recent.filter((c) => c !== color)],
    }));
    window.rtl.useRecentColor(projectPath, color).catch((error: unknown) => {
      console.error("Couldn't save recent color:", error);
    });
  },
}));

/**
 * Keep this window's history in step with every other window: reload when
 * the window's project changes, and take any history broadcast for it.
 * Call once at the editor's root.
 *
 * @returns Unsubscribe function.
 */
export function syncColorHistory(): () => void {
  void useColorHistoryStore.getState().load();
  const stopTabs = useTabStore.subscribe((state, previous) => {
    if (!sameProject(state.projectPath, previous.projectPath)) {
      void useColorHistoryStore.getState().load();
    }
  });
  const stopBroadcast = window.rtl.onRecentColorsChange((event) => {
    if (sameProject(event.projectPath, useTabStore.getState().projectPath)) {
      useColorHistoryStore.setState({ recent: event.colors });
    }
  });
  return () => {
    stopTabs();
    stopBroadcast();
  };
}
