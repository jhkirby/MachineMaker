/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Whether the live document may enter Simulate mode — only when the status
// bar's Simulation Ready indicator is green (checkSimulationReady). Shared
// by the toolbar toggle, the Ctrl+B command and the status bar, so all
// three always agree.

import { useMemo } from "react";
import {
  checkSimulationReady,
  type LinkedSchematicLookup,
  type SchematicValidity,
} from "../model/schematic-validity";
import { useDiagramStore } from "./diagram-store";
import { linkedSchematic, useLinkedSchematics } from "./module-links";

/**
 * The live document's simulation readiness, right now.
 *
 * @returns Whether it's ready, and why not if it isn't.
 */
export function currentSimulationReadiness(): SchematicValidity {
  const byPath = useLinkedSchematics.getState().byPath;
  const lookup: LinkedSchematicLookup = (relative) => linkedSchematic(byPath, relative);
  return checkSimulationReady(useDiagramStore.getState().diagram, lookup);
}

/**
 * The live document's simulation readiness, re-rendering as it changes.
 *
 * @returns Whether it's ready, and why not if it isn't.
 */
export function useSimulationReadiness(): SchematicValidity {
  const diagram = useDiagramStore((s) => s.diagram);
  const byPath = useLinkedSchematics((s) => s.byPath);
  return useMemo(
    () => checkSimulationReady(diagram, (relative) => linkedSchematic(byPath, relative)),
    [diagram, byPath],
  );
}

/**
 * Switch between Build and Simulate — but only into Simulate when the
 * document is ready for it. Leaving Simulate is always allowed.
 *
 * @returns True if the mode changed.
 */
export function toggleEditorMode(): boolean {
  const { mode, toggleMode } = useDiagramStore.getState();
  if (mode === "build" && !currentSimulationReadiness().valid) {
    return false;
  }
  toggleMode();
  return true;
}

/**
 * Drop back to Build whenever the document stops being simulation-ready
 * while in Simulate (a linked schematic changing underneath it, say, or
 * switching to a tab that isn't ready). Call once at the editor's root.
 *
 * @returns Unsubscribe function.
 */
export function enforceSimulationReadiness(): () => void {
  const check = () => {
    if (
      useDiagramStore.getState().mode === "simulate" &&
      !currentSimulationReadiness().valid
    ) {
      useDiagramStore.getState().toggleMode();
    }
  };
  const stopDiagram = useDiagramStore.subscribe(check);
  const stopLinks = useLinkedSchematics.subscribe(check);
  return () => {
    stopDiagram();
    stopLinks();
  };
}
