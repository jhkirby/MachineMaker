/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// The editor window's tabs. The diagram store (diagram-store.ts) only ever
// holds ONE live document — the active tab's — so every other tab parks its
// document-specific state here as a snapshot, swapped back in on switch.
// That keeps the whole editor (canvas, inspector, history, autosave) working
// unchanged against "the current document".

import { nanoid } from "nanoid";
import { create } from "zustand";
import type { Viewport } from "@xyflow/react";
import type { RtlDiagram } from "../../../shared/diagram-model";
import {
  MAX_EDITOR_TABS,
  type TransferredDocument,
} from "../../../shared/project-model";
import { useDiagramStore, type DiagramStore } from "./diagram-store";
import { saveNow } from "./use-autosave";

/** The per-document slice of the diagram store a parked tab keeps. */
interface DocumentSnapshot {
  diagram: DiagramStore["diagram"];
  filePath: DiagramStore["filePath"];
  dirty: DiagramStore["dirty"];
  selection: DiagramStore["selection"];
  past: DiagramStore["past"];
  future: DiagramStore["future"];
  /** Pan/zoom when the tab was left; null to fit the view on return. */
  viewport: Viewport | null;
}

/** One open document. */
export interface EditorTab {
  id: string;
  /** The parked document, or null for the active tab (it's live). */
  snapshot: DocumentSnapshot | null;
}

/** The canvas operations tab switching needs (CanvasHandle, narrowed). */
export interface TabCanvas {
  getViewport(): Viewport;
  setViewport(viewport: Viewport): void;
  fitView(): void;
}

interface TabState {
  tabs: EditorTab[];
  activeId: string;
  /** The project this editor belongs to; null for a loose editor. */
  projectPath: string | null;
}

const firstId = nanoid(8);

/** Tab list for this editor window. Starts as one tab on the live document. */
export const useTabStore = create<TabState>(() => ({
  tabs: [{ id: firstId, snapshot: null }],
  activeId: firstId,
  projectPath: null,
}));

/** Canvas registered by App, for saving/restoring each tab's viewport. */
let canvas: TabCanvas | null = null;

/**
 * Give the tab system access to the canvas (App does this once mounted).
 *
 * @param next - The canvas, or null on unmount.
 */
export function registerTabCanvas(next: TabCanvas | null): void {
  canvas = next;
}

/** @returns True when no more tabs may be opened. */
export function tabsFull(): boolean {
  return useTabStore.getState().tabs.length >= MAX_EDITOR_TABS;
}

/**
 * Capture the live document's state, ready to park in a tab.
 *
 * @returns The snapshot.
 */
function captureLive(): DocumentSnapshot {
  const { diagram, filePath, dirty, selection, past, future } =
    useDiagramStore.getState();
  return {
    diagram,
    filePath,
    dirty,
    selection,
    past,
    future,
    viewport: canvas?.getViewport() ?? null,
  };
}

/**
 * Make a parked snapshot the live document, restoring its viewport (or
 * fitting the view, for one never shown yet). The viewport is applied a
 * frame later, once the canvas has rendered the new document's nodes.
 *
 * @param snapshot - The document to bring back.
 */
function restoreLive(snapshot: DocumentSnapshot): void {
  useDiagramStore.setState({
    diagram: snapshot.diagram,
    filePath: snapshot.filePath,
    dirty: snapshot.dirty,
    selection: snapshot.selection,
    past: snapshot.past,
    future: snapshot.future,
    pendingDelete: null,
    armedPort: null,
  });
  requestAnimationFrame(() => {
    if (snapshot.viewport) {
      canvas?.setViewport(snapshot.viewport);
    } else {
      canvas?.fitView();
    }
  });
}

/**
 * A snapshot for a document just loaded from disk.
 *
 * @param diagram - The document.
 * @param filePath - Where it lives.
 * @returns A clean snapshot with no history, to be fitted on first show.
 */
function freshSnapshot(diagram: RtlDiagram, filePath: string | null): DocumentSnapshot {
  return {
    diagram,
    filePath,
    dirty: false,
    selection: { blockIds: [], wireIds: [] },
    past: [],
    future: [],
    viewport: null,
  };
}

/**
 * A parked snapshot for a document dragged in from another window. Its
 * undo history and view come with it.
 *
 * @param doc - The transferred document.
 * @returns The snapshot, selection cleared.
 */
function snapshotFromTransfer(doc: TransferredDocument): DocumentSnapshot {
  return {
    diagram: doc.diagram,
    filePath: doc.filePath,
    // The source window flushed it to disk before letting go.
    dirty: false,
    selection: { blockIds: [], wireIds: [] },
    past: doc.past,
    future: doc.future,
    viewport: doc.viewport,
  };
}

/**
 * Set up the tabs this window was launched with: each schematic becomes a
 * tab, the first one active; or, for a window opened by dragging a tab out
 * of another, that one transferred tab. With neither, the window keeps its
 * single tab on the untitled document the diagram store starts with.
 *
 * @param projectPath - The project new schematics go into.
 * @param documents - The schematics to open, in order.
 * @param transfer - A tab dragged in from another window, if any.
 */
export function initTabs(
  projectPath: string | null,
  documents: Array<{ diagram: RtlDiagram; path: string }>,
  transfer?: TransferredDocument,
): void {
  const snapshots = transfer
    ? [snapshotFromTransfer(transfer)]
    : documents.map((doc) => freshSnapshot(doc.diagram, doc.path));
  if (snapshots.length === 0) {
    useTabStore.setState({ projectPath });
    return;
  }
  const tabs: EditorTab[] = snapshots
    .slice(0, MAX_EDITOR_TABS)
    .map((snapshot) => ({ id: nanoid(8), snapshot }));
  const [first] = tabs;
  const firstSnapshot = first.snapshot as DocumentSnapshot;
  first.snapshot = null;
  useTabStore.setState({ tabs, activeId: first.id, projectPath });
  restoreLive(firstSnapshot);
}

/**
 * Open a document in a new tab and switch to it — or, if it's already open,
 * just switch to that tab.
 *
 * @param diagram - The document.
 * @param filePath - Where it lives.
 * @returns False if the tab limit stopped it.
 */
export async function openInNewTab(
  diagram: RtlDiagram,
  filePath: string,
): Promise<boolean> {
  const existing = findTabByPath(filePath);
  if (existing) {
    await switchTab(existing);
    return true;
  }
  if (tabsFull()) {
    return false;
  }
  await saveNow();
  const { tabs, activeId } = useTabStore.getState();
  const id = nanoid(8);
  const parked = captureLive();
  const index = tabs.findIndex((tab) => tab.id === activeId);
  const next = tabs.map((tab) =>
    tab.id === activeId ? { ...tab, snapshot: parked } : tab,
  );
  // New tabs open right after the current one, like a browser.
  next.splice(index + 1, 0, { id, snapshot: null });
  useTabStore.setState({ tabs: next, activeId: id });
  restoreLive(freshSnapshot(diagram, filePath));
  return true;
}

/**
 * Bring a tab to the front, parking the current one.
 *
 * @param id - The tab to show.
 */
export async function switchTab(id: string): Promise<void> {
  const { tabs, activeId } = useTabStore.getState();
  const target = tabs.find((tab) => tab.id === id);
  if (!target || id === activeId || !target.snapshot) {
    return;
  }
  // Flush the outgoing document to disk before it leaves the live store.
  await saveNow();
  const parked = captureLive();
  const incoming = target.snapshot;
  useTabStore.setState({
    tabs: useTabStore
      .getState()
      .tabs.map((tab) =>
        tab.id === activeId
          ? { ...tab, snapshot: parked }
          : tab.id === id
            ? { ...tab, snapshot: null }
            : tab,
      ),
    activeId: id,
  });
  restoreLive(incoming);
}

/**
 * Close a tab. Closing the active one saves it and moves to its neighbor;
 * closing the last tab returns the window to the home page.
 *
 * @param id - The tab to close.
 */
export async function closeTab(id: string): Promise<void> {
  const { tabs, activeId, projectPath } = useTabStore.getState();
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) {
    return;
  }
  if (id !== activeId) {
    // A parked tab was already flushed to disk when it was switched away from.
    useTabStore.setState({ tabs: tabs.filter((tab) => tab.id !== id) });
    return;
  }
  await saveNow();
  if (tabs.length === 1) {
    // Last tab: this editor window's job is done. Bring the home window
    // back up on its project and close this one.
    await window.rtl.returnHome(projectPath, true);
    return;
  }
  const neighbor = tabs[index + 1] ?? tabs[index - 1];
  const incoming = neighbor.snapshot as DocumentSnapshot;
  useTabStore.setState({
    tabs: tabs
      .filter((tab) => tab.id !== id)
      .map((tab) => (tab.id === neighbor.id ? { ...tab, snapshot: null } : tab)),
    activeId: neighbor.id,
  });
  restoreLive(incoming);
}

/**
 * The tab holding `filePath`, live or parked.
 *
 * @param filePath - A schematic's path.
 * @returns The tab's id, or null if it isn't open.
 */
function findTabByPath(filePath: string): string | null {
  const { tabs, activeId } = useTabStore.getState();
  const livePath = useDiagramStore.getState().filePath;
  const match = tabs.find((tab) =>
    tab.id === activeId
      ? livePath === filePath
      : tab.snapshot?.filePath === filePath,
  );
  return match?.id ?? null;
}

/**
 * Move a tab to a new position in the strip (drag to reorder).
 *
 * @param id - The tab being moved.
 * @param toIndex - Its new index.
 */
export function reorderTab(id: string, toIndex: number): void {
  const { tabs } = useTabStore.getState();
  const from = tabs.findIndex((tab) => tab.id === id);
  const to = Math.max(0, Math.min(tabs.length - 1, toIndex));
  if (from === -1 || from === to) {
    return;
  }
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  useTabStore.setState({ tabs: next });
}

/**
 * Package a tab's whole editing state for handing to another window. The
 * active tab is flushed to disk first, so the receiver starts from a saved
 * file and the two windows are never both dirty on it.
 *
 * @param id - The tab being dragged out.
 * @returns The transferable document, or null if the tab is gone.
 */
export async function exportTab(id: string): Promise<TransferredDocument | null> {
  const { tabs, activeId, projectPath } = useTabStore.getState();
  const tab = tabs.find((t) => t.id === id);
  if (!tab) {
    return null;
  }
  if (id === activeId) {
    await saveNow();
  }
  const snapshot = id === activeId ? captureLive() : tab.snapshot;
  if (!snapshot) {
    return null;
  }
  return {
    diagram: snapshot.diagram,
    filePath: snapshot.filePath,
    past: snapshot.past,
    future: snapshot.future,
    viewport: snapshot.viewport,
    projectPath,
  };
}

/**
 * Drop a tab that now lives in another window: no save (exportTab already
 * flushed it) and no trip home. A window left with no tabs closes.
 *
 * @param id - The tab that was handed off.
 */
export function releaseTab(id: string): void {
  const { tabs, activeId } = useTabStore.getState();
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) {
    return;
  }
  const rest = tabs.filter((tab) => tab.id !== id);
  if (rest.length === 0) {
    void window.rtl.windowClose();
    return;
  }
  if (id !== activeId) {
    useTabStore.setState({ tabs: rest });
    return;
  }
  const neighbor = tabs[index + 1] ?? tabs[index - 1];
  const incoming = neighbor.snapshot as DocumentSnapshot;
  useTabStore.setState({
    tabs: rest.map((tab) => (tab.id === neighbor.id ? { ...tab, snapshot: null } : tab)),
    activeId: neighbor.id,
  });
  restoreLive(incoming);
}

/**
 * Take in a tab dragged here from another window, inserting it where it was
 * dropped along the strip and making it active.
 *
 * @param doc - The transferred document.
 * @param screenX - Drop point, screen x, for the insertion index.
 */
export async function attachTab(doc: TransferredDocument, screenX: number): Promise<void> {
  if (doc.filePath) {
    const existing = findTabByPath(doc.filePath);
    if (existing) {
      await switchTab(existing);
      return;
    }
  }
  await saveNow();
  const index = insertionIndexAt(screenX - window.screenX);
  const { tabs, activeId } = useTabStore.getState();
  const parked = captureLive();
  const id = nanoid(8);
  const next = tabs.map((tab) =>
    tab.id === activeId ? { ...tab, snapshot: parked } : tab,
  );
  next.splice(index, 0, { id, snapshot: null });
  useTabStore.setState({ tabs: next, activeId: id });
  restoreLive(snapshotFromTransfer(doc));
}

/**
 * Which slot in this window's strip a point along it falls into.
 *
 * @param clientX - x within the window.
 * @returns The index a tab dropped there should take.
 */
function insertionIndexAt(clientX: number): number {
  const rects = [...document.querySelectorAll<HTMLElement>(".tab-bar__tab")].map(
    (el) => el.getBoundingClientRect(),
  );
  const index = rects.findIndex((rect) => clientX < rect.left + rect.width / 2);
  return index === -1 ? rects.length : index;
}

/**
 * Bring forward the tab holding `path` (another window asked to open it).
 *
 * @param path - A schematic's path.
 */
export async function activateTabByPath(path: string): Promise<void> {
  const id = findTabByPath(path);
  if (id) {
    await switchTab(id);
  }
}

/**
 * Tell the main process what this window has open, after every tab change,
 * so it can keep each file open in only one window and knows how full this
 * strip is when a tab is dragged onto it.
 *
 * @returns Unsubscribe function.
 */
export function reportOpenDocumentsOnChange(): () => void {
  let last = "";
  const report = () => {
    const { tabs, activeId } = useTabStore.getState();
    const livePath = useDiagramStore.getState().filePath;
    const paths = tabs
      .map((tab) => (tab.id === activeId ? livePath : tab.snapshot?.filePath))
      .filter((path): path is string => typeof path === "string");
    const key = JSON.stringify([paths, tabs.length]);
    if (key !== last) {
      last = key;
      void window.rtl.reportOpenDocuments({ paths, tabCount: tabs.length });
    }
  };
  report();
  const offTabs = useTabStore.subscribe(report);
  const offDiagram = useDiagramStore.subscribe((state, prev) => {
    if (state.filePath !== prev.filePath) {
      report();
    }
  });
  return () => {
    offTabs();
    offDiagram();
  };
}
