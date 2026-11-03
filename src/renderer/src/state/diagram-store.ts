/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { flushSync } from "react-dom";
import { create } from "zustand";
import type { Connection } from "@xyflow/react";
import {
  canTieOff,
  countedPorts,
  createEmptyDiagram,
  formatBusWidth,
  isClockPort,
  isResetPort,
  GATE_MAX_INPUTS,
  GATE_MIN_INPUTS,
  MAX_BUS_WIDTH,
  MAX_PORTS,
  MAX_STRUCTURED_BITS,
  MIN_BUS_WIDTH,
  MIN_STRUCTURED_BITS,
  type BlockKind,
  type CodecType,
  type GateRotation,
  type GateType,
  type ModuleDefinition,
  type PortDirection,
  type PortSide,
  type RtlDiagram,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";
import { isLinkedModule, linkablePorts } from "../../../shared/module-interface";
import { createBlock, createPort } from "../model/component-library";
import { reconcileModulePorts } from "../model/module-link-ports";
import { directionsCompatible } from "../model/flow-adapters";
import { FINE_GRID_SIZE, GRID_SIZE, snapToGrid } from "../model/grid";
import {
  centerPortGroups,
  growToFitPorts,
  minBlockSize,
  nextFreeSlot,
  normalizeFixedPorts,
  resizeToFitPorts,
} from "../model/port-layout";
import {
  hasWiresOn,
  isStructuredKind,
  portsDroppedBy,
} from "../model/structured-ports";
import { nanoid } from "nanoid";

const HISTORY_LIMIT = 50;

/** Ids of the currently selected blocks and wires. */
export interface Selection {
  blockIds: string[];
  wireIds: string[];
}

/** A port armed by a click, waiting for a second click to complete a wire. */
export interface ArmedPort {
  blockId: string;
  portId: string;
}

/** Pointer location over the canvas — see {@link DiagramStore.pointer}. */
export interface PointerPosition {
  screen: { x: number; y: number };
  cell: { x: number; y: number };
}

/** The app's color scheme — see the `[data-theme]` block in tokens.css. */
export type Theme = "dark" | "light";

/**
 * What the editor is for right now. "build" is ordinary editing;
 * "simulate" locks the document — anything can still be selected and
 * inspected, but nothing can be added, moved, wired, edited or deleted.
 */
export type EditorMode = "build" | "simulate";

/** localStorage key the last-chosen theme is persisted under. */
const THEME_STORAGE_KEY = "machinemaker:theme";

/**
 * The theme to start with: whatever was last saved, falling back to dark
 * (this app's original, still-default look) when nothing's stored yet or
 * storage isn't reachable (e.g. a very first run, or a restrictive webview).
 *
 * @returns The theme to render on first paint.
 */
function loadStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * Round a gate's grid-snapped length to an even number of cells, moving in
 * the direction the user is resizing — a gate's ports (and the drawn body's
 * tip) are symmetric about its midline, which only lands on a grid point
 * when the length is even (see symmetricGateSlots in port-layout.ts). So a
 * one-cell step from 6 goes to 8 or 4, not to an off-grid 7.
 *
 * @param target - The requested length, already snapped to the grid, in px.
 * @param current - The length before this resize, in px.
 * @returns The even-cell length to use, in px.
 */
function evenCellsToward(target: number, current: number): number {
  const cells = Math.round(target / GRID_SIZE);
  if (cells % 2 === 0) {
    return target;
  }
  return (target >= current ? cells + 1 : cells - 1) * GRID_SIZE;
}

/** Full editor state plus the commands that mutate it. */
export interface DiagramStore {
  diagram: RtlDiagram;
  /** Path the diagram was last opened from / saved to, or null if untitled. */
  filePath: string | null;
  /** True when there are unsaved changes. */
  dirty: boolean;
  selection: Selection;
  /** Whether the canvas grid overlay is drawn. Snapping ignores this. */
  gridVisible: boolean;
  /** Whether the canvas's bottom-right minimap is shown. On by default. */
  minimapVisible: boolean;
  /** The app's current color scheme, persisted across restarts. */
  theme: Theme;
  /** Build (editing) or Simulate (read-only) — see {@link EditorMode}. */
  mode: EditorMode;
  /**
   * Counts the times Simulate has been entered with {@link toggleMode} —
   * each one starts a fresh run (registers and cycle back to 0). Restoring
   * a tab that was already simulating doesn't touch it, so switching tabs
   * carries on the run where it was.
   */
  simulationRunId: number;
  /** Whether the left component palette is collapsed to a slim rail. */
  paletteCollapsed: boolean;
  /**
   * Which toolbar dropdown (File/Export) is open, or null if neither is —
   * lifted up here (rather than left as each ToolbarMenu's own local state)
   * so the Ctrl+F / Ctrl+E shortcuts can open one from outside the toolbar's
   * own component tree, the same way toggleGrid/toggleTheme already do for
   * their own toolbar controls.
   */
  openMenu: "file" | "import" | "export" | null;
  /**
   * Kind currently being dragged out of the palette, or null when no
   * palette drag is in progress. The canvas watches this to render a
   * grid-snapped preview of where the block would land.
   */
  draggingKind: BlockKind | null;
  /**
   * Kind waiting to be placed by click: a palette click enters this "place
   * mode", the canvas shows the block following the pointer, and the next
   * canvas click on a free spot drops it. Null when not in place mode —
   * cleared by a successful placement, re-clicking the palette item, or Esc.
   */
  placingKind: BlockKind | null;
  /**
   * Where the pointer is while it's over the canvas, for the status bar;
   * null when it's elsewhere. `screen` is in pixels from the canvas's own
   * top-left (unaffected by pan/zoom); `cell` is the diagram grid square
   * under it (follows pan/zoom).
   */
  pointer: PointerPosition | null;
  /**
   * Port armed by a click-to-connect gesture, waiting for a second click on a
   * compatible port to complete a wire (or Escape to cancel). Null when no
   * connection is pending.
   */
  armedPort: ArmedPort | null;
  /**
   * Components (plus any wires selected alongside them) waiting on the
   * type-DELETE confirmation popup (DeleteConfirmDialog.tsx), or null when
   * no popup is open. Captured at request time rather than read live from
   * `selection`, so the popup always deletes exactly what it named.
   */
  pendingDelete: Selection | null;
  past: RtlDiagram[];
  future: RtlDiagram[];

  // ── document lifecycle ──
  resetDocument(diagram: RtlDiagram, filePath: string | null): void;
  newDocument(): void;
  markSaved(filePath: string): void;
  /**
   * Record an autosave of `saved` to `filePath`. Only clears `dirty` if the
   * diagram is still exactly the one that was written — an edit made while
   * the write was in flight keeps the document dirty for the next save.
   */
  markAutosaved(filePath: string, saved: RtlDiagram): void;
  setTitle(title: string): void;

  // ── view ──
  /** Switch between Build and Simulate, leaving any half-done gesture. */
  toggleMode(): void;
  toggleGrid(): void;
  /** Show or hide the canvas minimap. */
  toggleMinimap(): void;
  toggleTheme(): void;
  togglePalette(): void;
  /** Open the given toolbar menu, or close it if it's already the open one. */
  toggleMenu(menu: "file" | "import" | "export"): void;
  closeMenu(): void;
  setDraggingKind(kind: BlockKind | null): void;
  /** Enter place mode for `kind`, or leave it when passed null. */
  setPlacingKind(kind: BlockKind | null): void;
  /**
   * Enter place mode for `kind`, or leave it if `kind` is already the one
   * being placed — what a palette click and its keyboard shortcut both do.
   */
  togglePlacingKind(kind: BlockKind): void;
  setPointer(pointer: PointerPosition | null): void;
  setArmedPort(port: ArmedPort | null): void;

  // ── blocks ──
  addBlock(kind: BlockKind, x: number, y: number): void;
  moveBlock(id: string, x: number, y: number): void;
  updateBlockLabel(id: string, label: string): void;
  /**
   * Set or clear a block's custom accent color.
   *
   * @param id - The block to recolor.
   * @param color - A `#rrggbb` hex color, or undefined to revert to the
   *   block's kind default (see resolvePalette in model/block-appearance.ts).
   */
  updateBlockColor(id: string, color: string | undefined): void;
  /**
   * Live-preview a color without its own undo step — the color wheel's
   * drag, the same way {@link previewResizeBlock} works for size: call
   * {@link beginInteraction} once when the drag starts, then this on every
   * move.
   */
  previewBlockColor(id: string, color: string): void;
  /**
   * Live-preview a resize without its own undo step — same idea as
   * {@link moveBlock} during a drag: call {@link beginInteraction} once when
   * the edit starts, then this on every subsequent change, so a whole edit
   * (e.g. every keystroke in the inspector's width/height fields) collapses
   * into the one step `beginInteraction` opened.
   */
  previewResizeBlock(id: string, width: number, height: number): void;

  // ── ports ──
  addPort(blockId: string, side: PortSide, direction: PortDirection): void;
  updatePort(blockId: string, portId: string, patch: Partial<RtlPort>): void;
  removePort(blockId: string, portId: string): void;
  /**
   * Tie a port off (mark it deliberately unused), or undo that. Only where
   * canTieOff allows, and refused while the port has a wire — a wired
   * port is plainly in use.
   */
  toggleTieOff(blockId: string, portId: string): void;
  setModuleSequential(blockId: string, sequential: boolean): void;
  setGateType(blockId: string, gateType: GateType): void;
  setGateRotation(blockId: string, gateRotation: GateRotation): void;
  /**
   * Switch a codec between encoder and decoder, rebuilding its ports with
   * default names. Refused while any wire touches the block — the swap
   * would turn every input into an output and break them.
   */
  setCodecType(blockId: string, codecType: CodecType): void;
  /**
   * Set a codec's or mux's size (see RtlBlock.bits), adding or removing
   * ports to match. Refused if it would remove a port that has a wire.
   */
  setStructuredBits(blockId: string, bits: number): void;
  /**
   * Set the bus width of a mux's data inputs and output. Refused while any
   * of those ports has a wire, which would be left mismatched.
   */
  setMuxDataWidth(blockId: string, dataWidth: number): void;
  /**
   * Link a module block to a schematic's interface, or bring an already
   * linked one back in line after that schematic changed: ports are added,
   * removed and reshaped to match, keeping wires wherever a port still
   * fits (see reconcileModulePorts in model/module-link-ports.ts).
   */
  applyModuleInterface(blockId: string, definition: ModuleDefinition): void;
  /**
   * Re-sync every module linked to `path` (project-relative) at once, in
   * one undo step — what a save of that schematic triggers. A no-op when
   * nothing is linked to it.
   */
  syncLinkedModules(path: string, definition: ModuleDefinition): void;
  /** Detach a module block from the schematic it was linked to. */
  unlinkModule(blockId: string): void;

  // ── wires ──
  connect(connection: Connection): void;
  updateWire(id: string, patch: Partial<RtlWire>): void;

  // ── selection / deletion ──
  setSelection(selection: Selection): void;
  deleteBlocks(ids: string[]): void;
  deleteWires(ids: string[]): void;
  deleteSelection(): void;
  /**
   * Begin deleting the current selection: wires alone go immediately, but
   * any selected component first opens the confirmation popup
   * ({@link DiagramStore.pendingDelete}).
   */
  requestDeleteSelection(): void;
  /** Delete everything {@link DiagramStore.pendingDelete} names, plus every
   * wire touching those components, and close the popup. */
  confirmPendingDelete(): void;
  /** Close the confirmation popup without deleting anything. */
  cancelPendingDelete(): void;

  // ── history ──
  undo(): void;
  redo(): void;
  beginInteraction(): void;
}

/**
 * Deep-clone a diagram for the history stack.
 *
 * @param diagram - The diagram to snapshot.
 * @returns An independent copy safe to store.
 */
function snapshot(diagram: RtlDiagram): RtlDiagram {
  return structuredClone(diagram);
}

export const useDiagramStore = create<DiagramStore>((set, get) => {
  /**
   * Apply a mutation to a fresh copy of the diagram, recording the pre-change
   * state on the undo stack.
   *
   * @param mutate - Receives a mutable clone of the diagram to change in place.
   */
  const commit = (
    mutate: (draft: RtlDiagram) => void,
    { evenWhileSimulating = false } = {},
  ): void => {
    // Simulate mode is read-only; every edit funnels through here, so this
    // one check is what actually holds that line (the UI merely hides the
    // controls). Only a linked module following its own schematic gets
    // through, since that isn't an edit made here.
    if (get().mode === "simulate" && !evenWhileSimulating) {
      return;
    }
    set((state) => {
      const before = snapshot(state.diagram);
      const draft = snapshot(state.diagram);
      // Each block's floor size before this edit, so a block sitting exactly
      // on it can shrink back down afterward (see resizeToFitPorts below) —
      // captured from the pre-mutation state, since a block's own ports are
      // about to change underneath it.
      const priorMinById = new Map(
        state.diagram.blocks.map((block) => [block.id, minBlockSize(block)]),
      );
      mutate(draft);
      // A module's clock/reset are pinned to fixed edge positions (see
      // normalizeFixedPorts) no matter what just changed — re-pin after every
      // mutation rather than trusting each action to remember to, so the
      // invariant can never drift no matter which action touched the ports.
      draft.blocks.forEach(normalizeFixedPorts);
      // A wire whose port no longer exists (a codec or mux shrunk under it,
      // say — see conformStructuredPorts) can't be drawn or saved
      // meaningfully, so it goes with its port wherever that happened.
      const livePorts = new Set(
        draft.blocks.flatMap((block) =>
          block.ports.map((port) => `${block.id}/${port.id}`),
        ),
      );
      draft.wires = draft.wires.filter(
        (wire) =>
          livePorts.has(`${wire.sourceBlockId}/${wire.sourcePortId}`) &&
          livePorts.has(`${wire.targetBlockId}/${wire.targetPortId}`),
      );
      // A shorter port name or a removed port can shrink a block's floor as
      // well as grow it; normalizeFixedPorts above only ever grows
      // (growToFitPorts), so re-fit each block to its current floor here,
      // where the *prior* floor needed to tell "sitting on the floor" apart
      // from "deliberately resized" is available.
      for (const block of draft.blocks) {
        resizeToFitPorts(block, priorMinById.get(block.id));
      }
      // Now that every block's final size for this edit is settled, re-center
      // each side's ports within it (see centerPortGroups) — sizing must run
      // first since centering needs to know the room actually available.
      draft.blocks.forEach(centerPortGroups);
      return {
        diagram: draft,
        past: [...state.past, before].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  };

  return {
    diagram: createEmptyDiagram(),
    filePath: null,
    dirty: false,
    selection: { blockIds: [], wireIds: [] },
    gridVisible: true,
    minimapVisible: true,
    theme: loadStoredTheme(),
    mode: "build",
    simulationRunId: 0,
    paletteCollapsed: false,
    openMenu: null,
    draggingKind: null,
    placingKind: null,
    pointer: null,
    armedPort: null,
    pendingDelete: null,
    past: [],
    future: [],

    // ── DOCUMENT LIFECYCLE ────────────────────────────────────────────────

    resetDocument: (diagram, filePath) =>
      set({
        diagram,
        filePath,
        dirty: false,
        selection: { blockIds: [], wireIds: [] },
        pendingDelete: null,
        past: [],
        future: [],
      }),

    newDocument: () =>
      set({
        diagram: createEmptyDiagram(),
        filePath: null,
        dirty: false,
        selection: { blockIds: [], wireIds: [] },
        pendingDelete: null,
        past: [],
        future: [],
      }),

    markSaved: (filePath) => set({ filePath, dirty: false }),

    markAutosaved: (filePath, saved) =>
      set((state) => ({
        filePath,
        dirty: state.diagram === saved ? false : state.dirty,
      })),

    setTitle: (title) => commit((draft) => void (draft.title = title)),

    // ── VIEW ──────────────────────────────────────────────────────────────

    toggleMode: () =>
      set((state) => ({
        mode: state.mode === "build" ? "simulate" : "build",
        simulationRunId:
          state.mode === "build" ? state.simulationRunId + 1 : state.simulationRunId,
        placingKind: null,
        draggingKind: null,
        armedPort: null,
        pendingDelete: null,
      })),

    toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
    toggleMinimap: () =>
      set((state) => ({ minimapVisible: !state.minimapVisible })),

    toggleTheme: () => {
      const theme: Theme = get().theme === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Best-effort persistence — a restrictive webview shouldn't block
        // the toggle itself from working for the rest of the session.
      }
      // The swap has to land synchronously inside the view-transition
      // callback: the browser snapshots the page before and after it, then
      // cross-fades the two (timing in app.css, THEME TRANSITION). That's
      // why the data-theme attribute is set here directly instead of waiting
      // for App's effect, and why React is flushed rather than batched —
      // otherwise the "after" snapshot would still show the old theme. A
      // whole-page snapshot also fades things CSS transitions can't reach,
      // like the minimap's <canvas> and the inline colors on every block.
      const apply = () => {
        flushSync(() => set({ theme }));
        document.documentElement.dataset.theme = theme;
      };
      if (typeof document.startViewTransition === "function") {
        document.startViewTransition(apply);
      } else {
        apply();
      }
    },

    togglePalette: () =>
      set((state) => ({ paletteCollapsed: !state.paletteCollapsed })),

    toggleMenu: (menu) =>
      set((state) => ({ openMenu: state.openMenu === menu ? null : menu })),

    closeMenu: () => set({ openMenu: null }),

    setDraggingKind: (kind) => set({ draggingKind: kind }),

    // A half-finished wire and a pending placement would both claim the next
    // canvas click, so entering place mode drops any armed port.
    setPlacingKind: (kind) =>
      set(
        kind && get().mode === "build"
          ? { placingKind: kind, armedPort: null }
          : { placingKind: null },
      ),

    // Skips the update when nothing shown would change, so a mousemove
    // doesn't re-render the status bar for nothing.
    setPointer: (pointer) => {
      const current = get().pointer;
      const same =
        pointer?.screen.x === current?.screen.x &&
        pointer?.screen.y === current?.screen.y &&
        pointer?.cell.x === current?.cell.x &&
        pointer?.cell.y === current?.cell.y;
      if (!same) {
        set({ pointer });
      }
    },

    togglePlacingKind: (kind) =>
      get().setPlacingKind(get().placingKind === kind ? null : kind),

    setArmedPort: (port) =>
      set({ armedPort: get().mode === "build" ? port : null }),

    // ── BLOCKS ────────────────────────────────────────────────────────────

    addBlock: (kind, x, y) =>
      commit((draft) => {
        draft.blocks.push(
          createBlock(
            kind,
            snapToGrid(x),
            snapToGrid(y),
            draft.blocks.map((b) => b.label),
          ),
        );
      }),

    moveBlock: (id, x, y) =>
      set((state) => state.mode === "simulate" ? state : ({
        diagram: {
          ...state.diagram,
          blocks: state.diagram.blocks.map((block) =>
            block.id === id
              ? {
                  // The canvas already snaps the drag to the zoom-appropriate
                  // pitch; clamp here to the finest grid so a position is never
                  // left off a line no matter where it came from.
                  ...block,
                  x: snapToGrid(x, FINE_GRID_SIZE),
                  y: snapToGrid(y, FINE_GRID_SIZE),
                }
              : block,
          ),
        },
        dirty: true,
      })),

    updateBlockLabel: (id, label) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === id);
        if (block) {
          block.label = label;
        }
      }),

    updateBlockColor: (id, color) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === id);
        if (block) {
          block.color = color;
        }
      }),

    previewBlockColor: (id, color) =>
      set((state) => state.mode === "simulate" ? state : ({
        diagram: {
          ...state.diagram,
          blocks: state.diagram.blocks.map((block) =>
            block.id === id ? { ...block, color } : block,
          ),
        },
        dirty: true,
      })),

    previewResizeBlock: (id, width, height) =>
      set((state) => state.mode === "simulate" ? state : ({
        diagram: {
          ...state.diagram,
          blocks: state.diagram.blocks.map((block) => {
            if (block.id !== id) {
              return block;
            }
            const resized = {
              ...block,
              ports: block.ports.map((port) => ({ ...port })),
            };
            const min = minBlockSize(resized);
            const snap = (target: number, current: number) =>
              block.kind === "gate"
                ? evenCellsToward(snapToGrid(target), current)
                : snapToGrid(target);
            resized.width = Math.max(min.width, snap(width, block.width));
            resized.height = Math.max(min.height, snap(height, block.height));
            // A gate's minimum depth follows its (just-changed) input face
            // length — see minBlockSize — so re-check against the new size.
            growToFitPorts(resized);
            // A module's clk/reset position, and every side's centering,
            // depend on the block's own size (normalizeFixedPorts,
            // centerPortGroups) — normally re-run after every `commit`, but
            // this bypasses commit to avoid a history entry per keystroke,
            // so re-run them here instead.
            normalizeFixedPorts(resized);
            centerPortGroups(resized);
            return resized;
          }),
        },
        dirty: true,
      })),

    // ── PORTS ─────────────────────────────────────────────────────────────

    addPort: (blockId, side, direction) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        // A codec's or mux's ports come only from its settings (see
        // structured-ports.ts), and a linked module's from its schematic's
        // I/O ports — one added by hand would be undone on the next sync.
        if (!block || isStructuredKind(block.kind) || isLinkedModule(block)) {
          return;
        }
        // A gate's own cap is its input count (GATE_MAX_INPUTS) — much
        // tighter than the generic MAX_PORTS, and counted directly rather
        // than through countedPorts, whose clk/reset exclusion doesn't apply
        // to a kind that never has either.
        const atCap =
          block.kind === "gate"
            ? block.ports.filter((port) => port.direction === "in").length >=
              GATE_MAX_INPUTS
            : countedPorts(block.ports) >= MAX_PORTS;
        if (atCap) {
          return;
        }
        const slot = nextFreeSlot(block, side);
        block.ports.push(
          createPort(
            side,
            direction,
            slot,
            block.ports.map((p) => p.name),
          ),
        );
        growToFitPorts(block);
      }),

    updatePort: (blockId, portId, patch) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        const port = block?.ports.find((p) => p.id === portId);
        if (!block || !port) {
          return;
        }
        const movedSide = patch.side !== undefined && patch.side !== port.side;
        // A linked module's port takes its direction and width from the
        // linked schematic; only its name and side are this schematic's
        // to choose.
        const ownShape =
          !isLinkedModule(block) || !linkablePorts(block).includes(port);
        Object.assign(
          port,
          ownShape
            ? patch
            : Object.fromEntries(
                Object.entries(patch).filter(
                  ([key]) => key !== "direction" && key !== "width",
                ),
              ),
        );
        if (movedSide) {
          // Its old slot is meaningless on the new side; take a free one there.
          port.slot = nextFreeSlot(block, port.side, port.id);
        }
        growToFitPorts(block);
      }),

    removePort: (blockId, portId) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (!block) {
          return;
        }
        const port = block.ports.find((p) => p.id === portId);
        if (!port) {
          return;
        }
        // A gate's own output can never be removed, and its inputs stop
        // being removable at GATE_MIN_INPUTS — see canRemovePort in
        // InspectorPanel.tsx, which is what actually keeps the × button
        // from appearing in the first place; this is the same backstop
        // normalizeFixedPorts is for direction/width, just for a mutation
        // that can't be un-done after the fact by re-normalizing.
        if (
          isStructuredKind(block.kind) ||
          (isLinkedModule(block) && linkablePorts(block).includes(port))
        ) {
          return;
        }
        if (
          block.kind === "gate" &&
          (port.direction !== "in" ||
            block.ports.filter((p) => p.direction === "in").length <=
              GATE_MIN_INPUTS)
        ) {
          return;
        }
        block.ports = block.ports.filter((p) => p.id !== portId);
        draft.wires = draft.wires.filter(
          (w) =>
            !(w.sourceBlockId === blockId && w.sourcePortId === portId) &&
            !(w.targetBlockId === blockId && w.targetPortId === portId),
        );
      }),

    toggleTieOff: (blockId, portId) => {
      const { diagram } = get();
      const block = diagram.blocks.find((b) => b.id === blockId);
      const port = block?.ports.find((p) => p.id === portId);
      if (
        !block ||
        !port ||
        !canTieOff(block.kind, port) ||
        (!port.tiedOff && hasWiresOn(diagram.wires, blockId, [portId]))
      ) {
        return;
      }
      commit((draft) => {
        const target = draft.blocks
          .find((b) => b.id === blockId)
          ?.ports.find((p) => p.id === portId);
        if (!target) {
          return;
        }
        if (target.tiedOff) {
          delete target.tiedOff;
        } else {
          target.tiedOff = true;
        }
      });
    },

    setModuleSequential: (blockId, sequential) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (!block) {
          return;
        }
        if (sequential) {
          if (!block.ports.some(isClockPort)) {
            block.ports.push({
              id: nanoid(6),
              name: "clk",
              side: "left",
              direction: "in",
              slot: nextFreeSlot(block, "left"),
            });
          }
          if (!block.ports.some(isResetPort)) {
            block.ports.push({
              id: nanoid(6),
              name: "reset",
              side: "bottom",
              direction: "in",
              slot: nextFreeSlot(block, "bottom"),
            });
          }
          // Slots picked above are provisional — commit()'s normalization
          // pass (normalizeFixedPorts) pins both to their fixed positions.
          growToFitPorts(block);
          return;
        }
        // Combinational: a clock or reset would be meaningless, so both go —
        // along with anything wired to them, same as removing a port by hand.
        const removed = new Set(
          block.ports
            .filter((p) => isClockPort(p) || isResetPort(p))
            .map((p) => p.id),
        );
        if (removed.size === 0) {
          return;
        }
        block.ports = block.ports.filter((p) => !removed.has(p.id));
        draft.wires = draft.wires.filter(
          (w) =>
            !(w.sourceBlockId === blockId && removed.has(w.sourcePortId)) &&
            !(w.targetBlockId === blockId && removed.has(w.targetPortId)),
        );
      }),

    setGateType: (blockId, gateType) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block && block.kind === "gate") {
          block.gateType = gateType;
        }
      }),

    // normalizeFixedPorts (run by commit() right after this) is what
    // actually re-pins every port's side to match the new rotation — this
    // just records the choice for it to read.
    setGateRotation: (blockId, gateRotation) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block && block.kind === "gate") {
          block.gateRotation = gateRotation;
        }
      }),

    setCodecType: (blockId, codecType) => {
      const { diagram } = get();
      const current = diagram.blocks.find((b) => b.id === blockId);
      if (
        !current ||
        current.kind !== "codec" ||
        current.codecType === codecType ||
        hasWiresOn(diagram.wires, blockId)
      ) {
        return;
      }
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.codecType = codecType;
          // Every port flips direction, so none of the old names (a0 → y0,
          // say) still describe anything — start the new type fresh;
          // normalizeFixedPorts (in commit) rebuilds them.
          block.ports = [];
        }
      });
    },

    setStructuredBits: (blockId, bits) => {
      const { diagram } = get();
      const current = diagram.blocks.find((b) => b.id === blockId);
      if (
        !current ||
        !isStructuredKind(current.kind) ||
        !Number.isInteger(bits) ||
        bits < MIN_STRUCTURED_BITS ||
        bits > MAX_STRUCTURED_BITS ||
        current.bits === bits ||
        hasWiresOn(diagram.wires, blockId, portsDroppedBy(current, { bits }))
      ) {
        return;
      }
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.bits = bits;
        }
      });
    },

    setMuxDataWidth: (blockId, dataWidth) => {
      const { diagram } = get();
      const current = diagram.blocks.find((b) => b.id === blockId);
      const dataPortIds =
        current?.ports
          .filter((port) => port.role !== "select")
          .map((port) => port.id) ?? [];
      if (
        !current ||
        current.kind !== "mux" ||
        !Number.isInteger(dataWidth) ||
        dataWidth < MIN_BUS_WIDTH ||
        dataWidth > MAX_BUS_WIDTH ||
        current.dataWidth === dataWidth ||
        hasWiresOn(diagram.wires, blockId, dataPortIds)
      ) {
        return;
      }
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          block.dataWidth = dataWidth;
        }
      });
    },

    applyModuleInterface: (blockId, definition) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block && block.kind === "module") {
          reconcileModulePorts(block, definition);
        }
      }),

    syncLinkedModules: (path, definition) => {
      const linked = get().diagram.blocks.some(
        (block) => isLinkedModule(block) && block.linkedModule?.path === path,
      );
      if (!linked) {
        return;
      }
      commit(
        (draft) => {
          for (const block of draft.blocks) {
            if (isLinkedModule(block) && block.linkedModule?.path === path) {
              reconcileModulePorts(block, definition);
            }
          }
        },
        { evenWhileSimulating: true },
      );
    },

    // The ports stay exactly as they are — they're simply this schematic's
    // own again, free to edit, with no schematic behind them.
    unlinkModule: (blockId) =>
      commit((draft) => {
        const block = draft.blocks.find((b) => b.id === blockId);
        if (block) {
          delete block.linkedModule;
          block.ports.forEach((port) => delete port.sourceId);
        }
      }),

    // ── WIRES ─────────────────────────────────────────────────────────────

    connect: (connection) =>
      commit((draft) => {
        const { source, target, sourceHandle, targetHandle } = connection;
        if (!source || !target || !sourceHandle || !targetHandle) {
          return;
        }
        if (source === target && sourceHandle === targetHandle) {
          return;
        }
        const duplicate = draft.wires.some(
          (w) =>
            w.sourceBlockId === source &&
            w.sourcePortId === sourceHandle &&
            w.targetBlockId === target &&
            w.targetPortId === targetHandle,
        );
        if (duplicate) {
          return;
        }

        const sourcePort = draft.blocks
          .find((b) => b.id === source)
          ?.ports.find((p) => p.id === sourceHandle);
        const targetPort = draft.blocks
          .find((b) => b.id === target)
          ?.ports.find((p) => p.id === targetHandle);
        if (
          !sourcePort ||
          !targetPort ||
          sourcePort.tiedOff ||
          targetPort.tiedOff ||
          !directionsCompatible(sourcePort.direction, targetPort.direction)
        ) {
          return;
        }
        if ((sourcePort?.width ?? 1) !== (targetPort?.width ?? 1)) {
          return;
        }
        const isBus = (sourcePort?.width ?? 1) > 1;
        const wire: RtlWire = {
          id: nanoid(8),
          sourceBlockId: source,
          sourcePortId: sourceHandle,
          targetBlockId: target,
          targetPortId: targetHandle,
          label: isBus ? formatBusWidth(sourcePort?.width) : undefined,
        };
        draft.wires.push(wire);
      }),

    updateWire: (id, patch) =>
      commit((draft) => {
        const wire = draft.wires.find((w) => w.id === id);
        if (wire) {
          Object.assign(wire, patch);
        }
      }),

    // ── SELECTION / DELETION ──────────────────────────────────────────────

    setSelection: (selection) => set({ selection }),

    deleteBlocks: (ids) => {
      const removed = new Set(ids);
      commit((draft) => {
        draft.blocks = draft.blocks.filter((b) => !removed.has(b.id));
        draft.wires = draft.wires.filter(
          (w) => !removed.has(w.sourceBlockId) && !removed.has(w.targetBlockId),
        );
      });
      // React Flow's own `deleteKeyCode` handling removes nodes this way
      // (through onNodesChange, not our deleteSelection), so a deleted block's
      // id must be dropped here too — otherwise it lingers in `selection`,
      // resolves to nothing, and leaves the inspector stuck open on a ghost.
      set((state) => {
        const remainingWireIds = new Set(state.diagram.wires.map((w) => w.id));
        return {
          selection: {
            blockIds: state.selection.blockIds.filter((id) => !removed.has(id)),
            wireIds: state.selection.wireIds.filter((id) => remainingWireIds.has(id)),
          },
        };
      });
    },

    deleteWires: (ids) => {
      const removed = new Set(ids);
      commit((draft) => {
        draft.wires = draft.wires.filter((w) => !removed.has(w.id));
      });
      set((state) => ({
        selection: {
          blockIds: state.selection.blockIds,
          wireIds: state.selection.wireIds.filter((id) => !removed.has(id)),
        },
      }));
    },

    deleteSelection: () => {
      const { selection } = get();
      if (selection.blockIds.length === 0 && selection.wireIds.length === 0) {
        return;
      }
      commit((draft) => {
        const blocks = new Set(selection.blockIds);
        const wires = new Set(selection.wireIds);
        draft.blocks = draft.blocks.filter((b) => !blocks.has(b.id));
        draft.wires = draft.wires.filter(
          (w) =>
            !wires.has(w.id) &&
            !blocks.has(w.sourceBlockId) &&
            !blocks.has(w.targetBlockId),
        );
      });
      set({ selection: { blockIds: [], wireIds: [] } });
    },

    requestDeleteSelection: () => {
      const { selection, mode } = get();
      if (mode === "simulate") {
        return;
      }
      if (selection.blockIds.length > 0) {
        set({
          pendingDelete: {
            blockIds: [...selection.blockIds],
            wireIds: [...selection.wireIds],
          },
        });
      } else if (selection.wireIds.length > 0) {
        get().deleteSelection();
      }
    },

    confirmPendingDelete: () => {
      const { pendingDelete } = get();
      if (!pendingDelete) {
        return;
      }
      set({ selection: pendingDelete, pendingDelete: null });
      get().deleteSelection();
    },

    cancelPendingDelete: () => set({ pendingDelete: null }),

    // ── HISTORY ───────────────────────────────────────────────────────────

    beginInteraction: () =>
      set((state) => {
        if (state.mode === "simulate") {
          return state;
        }
        // Skip if the last snapshot already matches — avoids no-op undo steps
        // when a drag starts but the pointer never actually moves a block.
        const last = state.past[state.past.length - 1];
        if (last && JSON.stringify(last) === JSON.stringify(state.diagram)) {
          return state;
        }
        return {
          past: [...state.past, snapshot(state.diagram)].slice(-HISTORY_LIMIT),
          future: [],
        };
      }),

    undo: () =>
      set((state) => {
        if (state.past.length === 0 || state.mode === "simulate") {
          return state;
        }
        const previous = state.past[state.past.length - 1];
        return {
          diagram: previous,
          past: state.past.slice(0, -1),
          future: [snapshot(state.diagram), ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0 || state.mode === "simulate") {
          return state;
        }
        const next = state.future[0];
        return {
          diagram: next,
          past: [...state.past, snapshot(state.diagram)].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          dirty: true,
        };
      }),
  };
});
