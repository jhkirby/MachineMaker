/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useStoreApi,
  useViewport,
  type EdgeChange,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import type { BlockKind } from "../../../shared/diagram-model";
import AdaptiveGridBackground from "./AdaptiveGridBackground";
import ComponentIcon from "./ComponentIcon";
import { PALETTE_DRAG_TYPE } from "./ComponentPalette";
import RtlBlockNode from "./nodes/RtlBlockNode";
import RtlWireEdge from "./edges/RtlWireEdge";
import {
  INVALID_PLACEMENT_PALETTE,
  WIRE_COLOR,
  paletteFor,
  resolvePalette,
} from "../model/block-appearance";
import { collidesWithOtherBlocks } from "../model/collision";
import { templateFor } from "../model/component-library";
import {
  toFlowEdges,
  toFlowNodes,
  type RtlBlockNode as RtlBlockNodeType,
} from "../model/flow-adapters";
import { snapPitchForZoom, snapToGrid } from "../model/grid";
import { portPosition } from "../model/port-geometry";
import { elbowPath, routeToPath, routeWires } from "../model/wire-router";
import { useDiagramStore, type Theme } from "../state/diagram-store";

/** Top-left of a grid-snapped drag preview, in canvas (flow) coordinates. */
interface DragPreviewState {
  x: number;
  y: number;
  /** True when this spot is too close to (or on top of) an existing block. */
  invalid: boolean;
}

/** Shared empty set, reused so callbacks that see "nothing excluded / nothing
 * dragging" don't allocate a fresh Set on every call. */
const NO_IDS: ReadonlySet<string> = new Set();

/** Glide, don't jump, when the fit-view control recentres the diagram. */
const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 200 };

/* Overrides React Flow's default Controls tooltips (bare "Zoom In" etc.,
   @xyflow/system) to fold in each one's keyboard shortcut — see
   use-keyboard-shortcuts.ts — matching the "(shortcut)" tooltip convention
   already used elsewhere (e.g. Toolbar's theme toggle). The lock/interactive
   button isn't listed here: it's replaced by a fully custom ControlButton
   below since its tooltip text has to flip with lock state, which a single
   static label can't do. */
const CONTROLS_ARIA_LABELS = {
  "controls.zoomIn.ariaLabel": "Zoom in (+)",
  "controls.zoomOut.ariaLabel": "Zoom out (-)",
  "controls.fitView.ariaLabel": "Fit view (C)",
} as const;

/** Hold Ctrl (or Cmd) to add/remove blocks from the current selection. */
const MULTI_SELECT_KEYS = ["Control", "Meta"];

const NODE_TYPES = { rtlBlock: RtlBlockNode };
const EDGE_TYPES = { rtlWire: RtlWireEdge };

/**
 * `--surface-canvas` for each theme (tokens.css), duplicated here because the
 * PNG export and the minimap both need a literal color rather than a CSS
 * variable: html-to-image bakes its background into a rasterized image, and
 * React Flow's MiniMap paints straight to its own <canvas>, so neither one
 * can simply inherit the page's cascade the way a DOM element does.
 */
const CANVAS_SURFACE_COLOR: Record<Theme, string> = {
  dark: "#14161b",
  light: "#e8eaef",
};

/* Same 32-unit viewBox and filled-path style as React Flow's own built-in
   Plus/Minus/FitView control icons (not exported by the library, so this
   custom control button — see the grid-toggle button below — draws its own
   grid glyph to match: a 2x2 grid of cells inside a border, out-and-back in
   one path so it inherits `fill: currentColor` the same way the built-ins
   do (app.css, CANVAS CONTROLS). */
function GridIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path d="M0 0h32v4.2H0zM0 13.9h32v4.2H0zM0 27.8h32v4.2H0zM0 0h4.2v32H0zM13.9 0h4.2v32h-4.2zM27.8 0h4.2v32h-4.2z" />
    </svg>
  );
}

/* React Flow's own Lock/Unlock glyphs (not exported by the library) for the
   custom lock control button below — copied verbatim from its Controls
   source so this reads as the exact same icon, just movable in the button
   order. */
function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 32">
      <path d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 32">
      <path d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z" />
    </svg>
  );
}

/** zIndex given to a block while it's being dragged, so it always renders
 * above every other block instead of whatever stacking order it started in.
 * This sticks for the whole drag: React Flow appears to only reconcile a
 * dragging node's *position* against the controlled `nodes` prop live,
 * freezing everything else about it (data, className, style) at whatever it
 * was when the drag started. A one-off value like this survives that fine;
 * the red invalid-placement indicator, which must change mid-drag, cannot go
 * through the node at all for the same reason — see invalidOverlayRects
 * below, which paints it as a separate, plain (non-node) element instead. */
const DRAGGING_Z_INDEX = 1000;

/** Imperative operations the surrounding app can trigger on the canvas. */
export interface CanvasHandle {
  /** Render the current diagram to a PNG data URL. */
  exportPng(): Promise<string>;
  /** Zoom/pan so the whole diagram is visible, gliding into place. */
  fitView(): void;
  /** Step the zoom in / out, matching the on-canvas +/- controls. */
  zoomIn(): void;
  zoomOut(): void;
  /** Flip interactivity (drag / connect / select) — the lock control. */
  toggleLock(): void;
  /** Clear every block/wire selection. */
  deselectAll(): void;
}

/**
 * The editing surface: a React Flow canvas wired to the diagram store, with
 * drag-and-drop block creation and image export.
 */
function DiagramCanvasImpl(_props: unknown, ref: React.Ref<CanvasHandle>) {
  const flow = useReactFlow();
  const storeApi = useStoreApi();
  const viewport = useViewport();

  // Drag snapping tightens to the sub-cell grid once the viewer zooms in far
  // enough for those lines to be aimable; see AdaptiveGridBackground.
  const zoom = useStore((s) => s.transform[2]);
  // Mirrors the selector React Flow's own Controls uses internally to decide
  // which of the Lock/Unlock glyphs to show — kept in sync here too since the
  // lock button below is a custom ControlButton, not the built-in one.
  const isInteractive = useStore(
    (s) => s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
  );
  const snapGrid = useMemo((): [number, number] => {
    const pitch = snapPitchForZoom(zoom);
    return [pitch, pitch];
  }, [zoom]);
  const diagram = useDiagramStore((s) => s.diagram);
  const selection = useDiagramStore((s) => s.selection);
  const gridVisible = useDiagramStore((s) => s.gridVisible);
  const toggleGrid = useDiagramStore((s) => s.toggleGrid);
  const theme = useDiagramStore((s) => s.theme);
  const draggingKind = useDiagramStore((s) => s.draggingKind);
  const armedPort = useDiagramStore((s) => s.armedPort);
  const setArmedPort = useDiagramStore((s) => s.setArmedPort);
  const moveBlock = useDiagramStore((s) => s.moveBlock);
  const addBlock = useDiagramStore((s) => s.addBlock);
  const deleteBlocks = useDiagramStore((s) => s.deleteBlocks);
  const deleteWires = useDiagramStore((s) => s.deleteWires);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const beginInteraction = useDiagramStore((s) => s.beginInteraction);

  // Grid-snapped landing spot for the block currently being dragged in from
  // the palette, updated on every dragover; null while nothing is over the
  // canvas (including "not dragging at all").
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);

  // Position each block held at the moment its own drag started, so an
  // invalid drop can snap it straight back instead of leaving it wherever the
  // pointer happened to release. Keyed by block id, covers a multi-select
  // drag as well as a single block.
  const dragOrigins = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(NO_IDS);
  const [invalidDragIds, setInvalidDragIds] = useState<ReadonlySet<string>>(NO_IDS);

  const nodes = useMemo(() => {
    const base = toFlowNodes(diagram, selection);
    if (draggingIds.size === 0) {
      return base;
    }
    // Elevate whatever's mid-drag above every other block. (Not also flagging
    // it invalid here — see DRAGGING_Z_INDEX's comment on why that has to be
    // a separate overlay instead.)
    return base.map((node) =>
      draggingIds.has(node.id) ? { ...node, zIndex: DRAGGING_Z_INDEX } : node,
    );
  }, [diagram, selection, draggingIds]);

  // Screen-space rects for the invalid-placement overlay: one per block
  // currently dragging somewhere it can't be dropped, painted as plain
  // elements (not node props) directly over the real node — see
  // DRAGGING_Z_INDEX's comment for why the node itself can't carry this.
  const invalidOverlayRects = useMemo(() => {
    if (invalidDragIds.size === 0) {
      return [];
    }
    return diagram.blocks.filter((block) => invalidDragIds.has(block.id));
  }, [diagram, invalidDragIds]);
  const routes = useMemo(() => routeWires(diagram), [diagram]);
  const edges = useMemo(
    () => toFlowEdges(diagram, selection, routes),
    [diagram, selection, routes],
  );

  // Capture where every block in a drag gesture started, so an invalid drop
  // can be snapped straight back; see onNodesChange below.
  const onNodeDragStart = useCallback<OnNodeDrag<RtlBlockNodeType>>(
    (_event, _node, draggedNodes) => {
      dragOrigins.current = new Map(
        draggedNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
      );
      setDraggingIds(new Set(draggedNodes.map((n) => n.id)));
      setInvalidDragIds(NO_IDS);
      beginInteraction();
    },
    [beginInteraction],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveBlock(change.id, change.position.x, change.position.y);
        } else if (change.type === "remove") {
          deleteBlocks([change.id]);
        }
      }

      // A rubber-band drag over the pane reports its result as "select"
      // changes rather than going through onNodeClick, so it never touches
      // our store on its own — leaving the box-selected block looking
      // unselected to us while React Flow's own (differently-styled) default
      // selection box renders on top of it. Folding these into the same
      // store selectExclusive already writes to makes every selection method
      // render through the one ".rtl-block.is-selected" look; see the
      // matching CSS rule that hides React Flow's own selection box.
      const nodeSelectChanges = changes.filter(
        (c): c is NodeChange & { type: "select" } => c.type === "select",
      );
      if (nodeSelectChanges.length > 0) {
        const current = useDiagramStore.getState().selection;
        let blockIds = current.blockIds;
        for (const change of nodeSelectChanges) {
          blockIds = change.selected
            ? blockIds.includes(change.id)
              ? blockIds
              : [...blockIds, change.id]
            : blockIds.filter((id) => id !== change.id);
        }
        setSelection({ blockIds, wireIds: current.wireIds });
      }

      if (draggingIds.size === 0) {
        return;
      }

      // Re-check every block still mid-drag against the positions just
      // committed above, and settle (accept or snap back) any that just
      // released. A block never blocks its own drag-mates: their relative
      // offsets haven't changed, so if they didn't collide before the drag
      // they still don't now.
      //
      // React Flow interleaves unrelated change batches mid-drag (e.g. plain
      // "dimensions" re-measurements with no position field, no relevant id)
      // alongside the real position batches. Only touch invalidDragIds for
      // ids this specific batch actually reports a position for — otherwise
      // one of those unrelated batches would wipe out a correctly-detected
      // invalid state a moment after it was set, flickering it back to valid
      // every other frame.
      const blocks = useDiagramStore.getState().diagram.blocks;
      const finished: string[] = [];
      let nextInvalid: Set<string> | null = null;
      for (const change of changes) {
        if (
          change.type !== "position" ||
          !change.position ||
          !draggingIds.has(change.id)
        ) {
          continue;
        }
        const block = blocks.find((b) => b.id === change.id);
        if (!block) {
          continue;
        }
        const invalid = collidesWithOtherBlocks(block, blocks, draggingIds);
        if (change.dragging === false) {
          finished.push(change.id);
          const origin = dragOrigins.current.get(change.id);
          if (invalid && origin) {
            moveBlock(change.id, origin.x, origin.y);
          }
        } else {
          nextInvalid ??= new Set(invalidDragIds);
          if (invalid) {
            nextInvalid.add(change.id);
          } else {
            nextInvalid.delete(change.id);
          }
        }
      }

      if (finished.length > 0) {
        setDraggingIds((prev) => {
          const next = new Set(prev);
          finished.forEach((id) => next.delete(id));
          return next;
        });
        // A block that just finished is no longer "mid-drag" at all, valid
        // or not (an invalid one is already being snapped back above).
        nextInvalid ??= new Set(invalidDragIds);
        finished.forEach((id) => nextInvalid?.delete(id));
      }
      if (nextInvalid) {
        setInvalidDragIds(nextInvalid);
      }
    },
    [moveBlock, deleteBlocks, draggingIds, invalidDragIds, setSelection],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = changes
        .filter((c): c is EdgeChange & { type: "remove" } => c.type === "remove")
        .map((c) => c.id);
      if (removed.length > 0) {
        deleteWires(removed);
      }

      // Same rubber-band-select relay as onNodesChange, for wires caught in
      // the box.
      const edgeSelectChanges = changes.filter(
        (c): c is EdgeChange & { type: "select" } => c.type === "select",
      );
      if (edgeSelectChanges.length > 0) {
        const current = useDiagramStore.getState().selection;
        let wireIds = current.wireIds;
        for (const change of edgeSelectChanges) {
          wireIds = change.selected
            ? wireIds.includes(change.id)
              ? wireIds
              : [...wireIds, change.id]
            : wireIds.filter((id) => id !== change.id);
        }
        setSelection({ blockIds: current.blockIds, wireIds });
      }
    },
    [deleteWires, setSelection],
  );

  const clearSelection = useCallback(() => {
    setSelection({ blockIds: [], wireIds: [] });
  }, [setSelection]);

  // Selection is owned by the store, not React Flow: a plain click selects just
  // the thing clicked (replacing whatever was selected), and Ctrl/Cmd-click adds
  // or removes it. Writing straight to the store keeps a single click from
  // racing React Flow's own controlled-selection round-trip.
  const selectExclusive = useCallback(
    (kind: "block" | "wire", id: string, additive: boolean) => {
      if (!storeApi.getState().elementsSelectable) {
        return;
      }
      const current = useDiagramStore.getState().selection;
      const list = kind === "block" ? current.blockIds : current.wireIds;
      const nextList = additive
        ? list.includes(id)
          ? list.filter((existing) => existing !== id)
          : [...list, id]
        : [id];
      const rest = additive
        ? kind === "block"
          ? current.wireIds
          : current.blockIds
        : [];
      setSelection(
        kind === "block"
          ? { blockIds: nextList, wireIds: rest }
          : { blockIds: rest, wireIds: nextList },
      );
    },
    [setSelection, storeApi],
  );

  const onNodeClick = useCallback<NodeMouseHandler<RtlBlockNodeType>>(
    (event, node) => {
      selectExclusive("block", node.id, event.ctrlKey || event.metaKey);
    },
    [selectExclusive],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      selectExclusive("wire", edge.id, event.ctrlKey || event.metaKey);
    },
    [selectExclusive],
  );

  // Where a block of `kind` would land if dropped centred under (x, y) and
  // whether that spot is too close to an existing block — snapped to the same
  // grid addBlock itself snaps to, and checked with the same rule a block
  // drag is held to, so the live preview, the drop, and an in-canvas move
  // never disagree.
  const previewDropAt = useCallback(
    (kind: BlockKind, x: number, y: number): DragPreviewState => {
      const template = templateFor(kind);
      const snapped = {
        x: snapToGrid(x - template.defaultWidth / 2),
        y: snapToGrid(y - template.defaultHeight / 2),
      };
      const candidate = {
        ...snapped,
        width: template.defaultWidth,
        height: template.defaultHeight,
      };
      const blocks = useDiagramStore.getState().diagram.blocks;
      return {
        ...snapped,
        invalid: collidesWithOtherBlocks(candidate, blocks, NO_IDS),
      };
    },
    [],
  );

  const onDragOver = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!draggingKind) {
        return;
      }
      const point = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setDragPreview(previewDropAt(draggingKind, point.x, point.y));
    },
    [flow, draggingKind, previewDropAt],
  );

  const onDragLeave = useCallback(() => setDragPreview(null), []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragPreview(null);
      const kind = event.dataTransfer.getData(PALETTE_DRAG_TYPE) as BlockKind;
      if (!kind) {
        return;
      }
      const point = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const { x, y, invalid } = previewDropAt(kind, point.x, point.y);
      if (invalid) {
        // Too close to (or on top of) an existing block — the red preview
        // already warned; refuse the drop rather than place it anyway.
        return;
      }
      addBlock(kind, x, y);
    },
    [flow, addBlock, previewDropAt],
  );

  // ── CLICK-TO-CONNECT PREVIEW ──────────────────────────────────────────────

  // The armed port's owning block/port, looked up fresh so a block move or
  // deletion while armed is reflected immediately.
  const armedPortAnchor = useMemo(() => {
    if (!armedPort) {
      return null;
    }
    const block = diagram.blocks.find((b) => b.id === armedPort.blockId);
    const port = block?.ports.find((p) => p.id === armedPort.portId);
    return block && port ? { block, port } : null;
  }, [armedPort, diagram]);

  // Current pointer position in flow coordinates. Only tracked while a
  // connection is armed — there is nothing to draw otherwise.
  const [pointerFlowPosition, setPointerFlowPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!armedPort) {
      setPointerFlowPosition(null);
    }
  }, [armedPort]);

  const onCanvasMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      if (!armedPort) {
        return;
      }
      setPointerFlowPosition(
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [armedPort, flow],
  );

  // Shift+scroll pans left/right, Ctrl+scroll pans up/down — both override
  // React Flow's own default of zooming on every wheel event. Caught on the
  // capture phase (before React Flow's own listener, which it attaches
  // natively via d3-zoom rather than through React) so stopping propagation
  // here reliably keeps that default zoom from also firing for the same
  // event; a plain, unmodified wheel is left completely alone.
  const onCanvasWheel = useCallback(
    (event: ReactWheelEvent) => {
      if (!event.shiftKey && !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Some trackpads/OSes already turn a shift-held scroll into a
      // horizontal delta before it reaches us; prefer that when present and
      // fall back to the vertical wheel amount otherwise.
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      const current = flow.getViewport();
      flow.setViewport(
        event.shiftKey
          ? { ...current, x: current.x - delta }
          : { ...current, y: current.y - delta },
        { duration: 0 },
      );
    },
    [flow],
  );

  // Esc drops an armed connection — the only way to cancel it besides
  // completing it or re-clicking the same port (see RtlBlockNode).
  useEffect(() => {
    if (!armedPort) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArmedPort(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armedPort, setArmedPort]);

  // The live wire-in-progress: an orthogonal elbow leaving the armed port,
  // snapped to the same grid pitch the rest of the canvas snaps to, so it
  // reads as part of the same drawing rather than a free-floating line.
  const connectPreview = useMemo(() => {
    if (!armedPortAnchor || !pointerFlowPosition) {
      return null;
    }
    const pitch = snapPitchForZoom(zoom);
    const from = portPosition(armedPortAnchor.block, armedPortAnchor.port);
    const to = {
      x: snapToGrid(pointerFlowPosition.x, pitch),
      y: snapToGrid(pointerFlowPosition.y, pitch),
    };
    const points = elbowPath(from, to, armedPortAnchor.port.side);
    return {
      path: routeToPath({ points, hops: [] }),
      isBus: (armedPortAnchor.port.width ?? 1) > 1,
    };
  }, [armedPortAnchor, pointerFlowPosition, zoom]);

  const toggleInteractivity = useCallback(() => {
    // Mirror what the Controls lock button does to the internal store.
    const next = !storeApi.getState().nodesDraggable;
    storeApi.setState({
      nodesDraggable: next,
      nodesConnectable: next,
      elementsSelectable: next,
    });
  }, [storeApi]);

  useImperativeHandle(
    ref,
    () => ({
      fitView: () => flow.fitView(FIT_VIEW_OPTIONS),
      zoomIn: () => flow.zoomIn({ duration: 150 }),
      zoomOut: () => flow.zoomOut({ duration: 150 }),
      toggleLock: toggleInteractivity,
      deselectAll: () => clearSelection(),
      exportPng: async () => {
        const currentNodes = flow.getNodes();
        const bounds = getNodesBounds(currentNodes);
        const width = Math.max(bounds.width + 120, 400);
        const height = Math.max(bounds.height + 120, 300);
        const viewport = getViewportForBounds(bounds, width, height, 0.3, 2, 0.1);
        const viewportEl = document.querySelector<HTMLElement>(
          ".react-flow__viewport",
        );
        if (!viewportEl) {
          throw new Error("React Flow viewport element not found.");
        }
        return toPng(viewportEl, {
          backgroundColor: CANVAS_SURFACE_COLOR[theme],
          width,
          height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
        });
      },
    }),
    [flow, storeApi, clearSelection, theme, toggleInteractivity],
  );

  const previewTemplate = draggingKind ? templateFor(draggingKind) : null;
  const previewColors = dragPreview?.invalid
    ? INVALID_PLACEMENT_PALETTE
    : draggingKind
      ? paletteFor(draggingKind, theme)
      : null;

  return (
    <div
      className="canvas"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseMove={onCanvasMouseMove}
      onWheelCapture={onCanvasWheel}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={clearSelection}
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        snapToGrid
        snapGrid={snapGrid}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        deleteKeyCode={["Delete", "Backspace"]}
        defaultEdgeOptions={{ type: "rtlWire" }}
        ariaLabelConfig={CONTROLS_ARIA_LABELS}
      >
        {gridVisible ? <AdaptiveGridBackground /> : null}
        <Controls
          position="top-right"
          orientation="horizontal"
          fitViewOptions={FIT_VIEW_OPTIONS}
          showInteractive={false}
        >
          <ControlButton
            className="react-flow__controls-gridtoggle"
            onClick={toggleGrid}
            title={gridVisible ? "Hide grid (Ctrl+G)" : "Show grid (Ctrl+G)"}
            aria-label={gridVisible ? "Hide grid" : "Show grid"}
          >
            <GridIcon />
          </ControlButton>
          <ControlButton
            className="react-flow__controls-interactive"
            onClick={toggleInteractivity}
            title={isInteractive ? "Lock canvas (L)" : "Unlock canvas (L)"}
            aria-label={isInteractive ? "Lock canvas" : "Unlock canvas"}
          >
            {isInteractive ? <UnlockIcon /> : <LockIcon />}
          </ControlButton>
        </Controls>
        <MiniMap<RtlBlockNodeType>
          pannable
          zoomable
          bgColor={CANVAS_SURFACE_COLOR[theme]}
          maskColor={
            theme === "dark" ? "rgba(10, 11, 14, 0.6)" : "rgba(20, 22, 27, 0.25)"
          }
          nodeColor={(node) => resolvePalette(node.data.block, theme).fill}
          nodeStrokeColor={(node) => resolvePalette(node.data.block, theme).stroke}
          nodeStrokeWidth={3}
          nodeBorderRadius={2}
        />
      </ReactFlow>

      {dragPreview && draggingKind && previewTemplate && previewColors ? (
        <div
          className="drag-preview"
          style={{
            left: dragPreview.x * viewport.zoom + viewport.x,
            top: dragPreview.y * viewport.zoom + viewport.y,
            width: previewTemplate.defaultWidth * viewport.zoom,
            height: previewTemplate.defaultHeight * viewport.zoom,
            background: previewColors.fill,
            borderColor: previewColors.stroke,
            color: previewColors.text,
          }}
        >
          <span className="drag-preview__icon" style={{ color: previewColors.stroke }}>
            <ComponentIcon kind={draggingKind} />
          </span>
          <span className="drag-preview__label">{previewTemplate.displayName}</span>
        </div>
      ) : null}

      {invalidOverlayRects.map((block) => (
        <div
          key={block.id}
          className="invalid-placement-overlay"
          style={{
            left: block.x * viewport.zoom + viewport.x,
            top: block.y * viewport.zoom + viewport.y,
            width: block.width * viewport.zoom,
            height: block.height * viewport.zoom,
          }}
        />
      ))}

      {connectPreview ? (
        <svg className="connect-preview" aria-hidden="true">
          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            <path
              className="connect-preview__path"
              d={connectPreview.path}
              // Always grey, even for a bus: unlike a committed wire (which
              // needs the color/width difference to stay identifiable once
              // it's one of many on the canvas), an in-progress connection is
              // the only one of its kind on screen at any moment, so there's
              // nothing for a bus's own blue to disambiguate here — plain
              // grey reads as "not committed yet" regardless of bit width.
              stroke={WIRE_COLOR}
              strokeWidth={connectPreview.isBus ? 3 : 1.5}
              fill="none"
            />
          </g>
        </svg>
      ) : null}
    </div>
  );
}

const DiagramCanvas = forwardRef<CanvasHandle, unknown>(DiagramCanvasImpl);
export default DiagramCanvas;
