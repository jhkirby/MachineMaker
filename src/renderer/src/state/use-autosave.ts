/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect } from "react";
import { useDiagramStore } from "./diagram-store";

/** Quiet time after the last edit before it's written to disk. Long enough
 *  that a drag or a burst of typing becomes one write, not dozens. */
const AUTOSAVE_DELAY_MS = 800;

/** One save at a time; a request made mid-save runs right after it. */
let inFlight: Promise<void> | null = null;
let rerun = false;

/**
 * Write the current diagram to disk now if it has unsaved changes — to its
 * file, or to a new one in Documents/RTL Schematic if it has none yet (see
 * ProjectFileService.autosaveDiagram).
 *
 * @returns Resolves once the diagram on disk is up to date.
 */
export async function saveNow(): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    do {
      rerun = false;
      const { diagram, filePath, dirty, markAutosaved } = useDiagramStore.getState();
      if (!dirty) {
        continue;
      }
      try {
        const result = await window.rtl.autosaveDiagram({
          diagram,
          path: filePath ?? undefined,
        });
        if (result.ok && result.path) {
          markAutosaved(result.path, diagram);
        }
      } catch (error) {
        // Left dirty, so the next edit (or New/Open) retries the write.
        console.error("Autosave failed:", error);
      }
    } while (rerun);
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Save the diagram automatically a moment after each change, for the
 * lifetime of the component.
 */
export function useAutosave(): void {
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useDiagramStore.subscribe((state, prev) => {
      if (state.dirty && state.diagram !== prev.diagram) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
