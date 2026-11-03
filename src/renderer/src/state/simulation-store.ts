/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// The state of a simulation run — the values driven onto the schematic's
// inputs, what its registers hold, how many clock edges have been strobed —
// and the settled value on every port that follows from them (computed by
// model/simulator.ts). Lives apart from the document (diagram-store.ts)
// and none of it is saved. Input values outlive the run: flipping back to
// Build and into Simulate again drives every input that still exists with
// the value it had. Registers and the cycle count start fresh on each
// entry into Simulate, but carry on across a tab switch. Inputs and
// registers are keyed by block ids, unique across documents, so one map
// serves every tab; the cycle count is kept per document.

import { create } from "zustand";
import {
  CircuitSimulator,
  type RegisterState,
  type SignalValue,
} from "../model/simulator";
import { hiddenValueTags } from "../model/value-tags";
import { useDiagramStore } from "./diagram-store";
import { linkedSchematic, useLinkedSchematics } from "./module-links";

/** One simulation run. */
interface SimulationState {
  /** Values driven onto inputs, by I/O block id. Unset inputs read 0. */
  inputs: ReadonlyMap<string, bigint>;
  /** Register contents, by register path (see RegisterState). */
  registers: RegisterState;
  /** Clock edges strobed so far this run, per document (see documentKey). */
  cycles: ReadonlyMap<string, number>;
  /** Every top-level port's settled value, keyed `${blockId}/${portId}`. */
  ports: ReadonlyMap<string, SignalValue>;
  /** Value tags left off the canvas because they'd overlap another. */
  hiddenTags: ReadonlySet<string>;
  /** Drive a value onto an input. */
  setInput(id: string, value: bigint): void;
  /** Strobe the clock once: every register takes its next state. */
  strobeClock(): void;
  /**
   * Start a fresh run of the live document: its registers and cycle back
   * to 0. Input values are kept.
   */
  reset(): void;
}

/**
 * Which document a cycle count belongs to: the live document's file (or ""
 * for one never saved).
 *
 * @returns The key.
 */
export function documentKey(): string {
  return useDiagramStore.getState().filePath ?? "";
}

/**
 * A simulator for the live document, resolving linked schematics from what
 * this window has loaded.
 *
 * @returns The simulator.
 */
function simulatorForLiveDocument(): CircuitSimulator {
  const byPath = useLinkedSchematics.getState().byPath;
  return new CircuitSimulator(useDiagramStore.getState().diagram, (relative) =>
    linkedSchematic(byPath, relative),
  );
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  inputs: new Map(),
  registers: new Map(),
  cycles: new Map(),
  ports: new Map(),
  hiddenTags: new Set(),
  setInput: (id, value) => {
    const inputs = new Map(get().inputs);
    inputs.set(id, value);
    set({ inputs });
  },
  strobeClock: () => {
    const { inputs, registers, cycles } = get();
    const key = documentKey();
    set({
      registers: simulatorForLiveDocument().clock(inputs, registers),
      cycles: new Map(cycles).set(key, (cycles.get(key) ?? 0) + 1),
    });
  },
  reset: () => {
    // Only this document's registers go: their paths all start with one of
    // its own block ids.
    const ids = new Set(useDiagramStore.getState().diagram.blocks.map((b) => b.id));
    const registers = new Map(
      [...get().registers].filter(([path]) => !ids.has(path.split("/")[0])),
    );
    const cycles = new Map(get().cycles);
    cycles.delete(documentKey());
    set({ registers, cycles });
  },
}));

/**
 * Re-settle every port's value from the current inputs and registers.
 */
function resettle(): void {
  if (useDiagramStore.getState().mode !== "simulate") {
    return;
  }
  const { inputs, registers } = useSimulationStore.getState();
  const { ports } = simulatorForLiveDocument().evaluate(inputs, registers);
  useSimulationStore.setState({
    ports,
    hiddenTags: hiddenValueTags(useDiagramStore.getState().diagram, ports),
  });
}

/**
 * Run the engine for the editor: start a fresh run each time Simulate mode
 * is entered, and re-settle every port's value whenever an input, the
 * registers, the document or a linked schematic changes while simulating.
 * Call once at the editor's root.
 *
 * @returns Unsubscribe function.
 */
export function startSimulationEngine(): () => void {
  const stopMode = useDiagramStore.subscribe((state, previous) => {
    if (state.simulationRunId !== previous.simulationRunId) {
      // Entered Simulate from the toggle: a fresh run, inputs kept.
      useSimulationStore.getState().reset();
      resettle();
    } else if (
      state.mode === "simulate" &&
      (state.mode !== previous.mode || state.diagram !== previous.diagram)
    ) {
      // A tab restored mid-run, or the document changed: carry on.
      resettle();
    }
  });
  const stopRun = useSimulationStore.subscribe((state, previous) => {
    if (state.inputs !== previous.inputs || state.registers !== previous.registers) {
      resettle();
    }
  });
  const stopLinks = useLinkedSchematics.subscribe(resettle);
  return () => {
    stopMode();
    stopRun();
    stopLinks();
  };
}
