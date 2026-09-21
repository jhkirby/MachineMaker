/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Manhattan wire routing on the diagram grid. Every wire is an A* path over
// grid cells: it turns only at grid points, never crosses a component
// footprint, and pays a penalty for sharing a cell with an earlier wire so
// parallel runs spread out. Wires are routed in creation order, and where a
// newer wire has to cross an older one a small "hop" arc is recorded so the
// crossing reads cleanly.

import type { RtlDiagram } from "../../../shared/diagram-model";
import { FINE_GRID_SIZE } from "./grid";
import { MinHeap } from "./min-heap";
import { outwardNormal, portPosition, type Point } from "./port-geometry";

/** A point where a wire jumps over an older wire it crosses. */
export interface WireHop {
  x: number;
  y: number;
  /** True when the crossed-over run of this wire is horizontal at the hop. */
  horizontal: boolean;
}

/** A fully routed wire: an orthogonal polyline plus any crossing hops. */
export interface RoutedWire {
  points: Point[];
  hops: WireHop[];
}

// Routed on the fine grid, not the coarser GRID_SIZE: a dragged block can land
// on any fine-grid multiple (see moveBlock in diagram-store.ts), and a port's
// anchor inherits that offset. Pathing on the coarser grid would leave such a
// port off the routing grid entirely, turning its first/last segment diagonal
// instead of axis-aligned.
const CELL = FINE_GRID_SIZE;
const MARGIN_CELLS = 6;
const TURN_COST = 3;
const SHARED_WIRE_COST = 5;
const HOP_RADIUS = 5;

/** Direction codes carried in an A* state: none / horizontal / vertical. */
const DIR_NONE = 0;
const DIR_H = 1;
const DIR_V = 2;
const STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, DIR_H],
  [-1, 0, DIR_H],
  [0, 1, DIR_V],
  [0, -1, DIR_V],
];

/**
 * Route every wire in a diagram.
 *
 * @param diagram - The diagram whose wires need paths.
 * @returns A map from wire id to its routed polyline and hops. Wires whose
 *   endpoints cannot be resolved map to an empty route.
 */
export function routeWires(diagram: RtlDiagram): Map<string, RoutedWire> {
  const routes = new Map<string, RoutedWire>();
  if (diagram.wires.length === 0 || diagram.blocks.length === 0) {
    return routes;
  }

  const grid = buildGrid(diagram);
  const blockById = new Map(diagram.blocks.map((block) => [block.id, block]));

  // Cells already carrying a wire, tagged with that wire's index, so later
  // wires can be nudged onto a parallel track instead of overlapping.
  const wireOwner = new Int32Array(grid.cols * grid.rows).fill(-1);

  const polylines: (Point[] | null)[] = [];

  diagram.wires.forEach((wire, index) => {
    const source = blockById.get(wire.sourceBlockId);
    const target = blockById.get(wire.targetBlockId);
    const sourcePort = source?.ports.find((p) => p.id === wire.sourcePortId);
    const targetPort = target?.ports.find((p) => p.id === wire.targetPortId);
    if (!source || !target || !sourcePort || !targetPort) {
      routes.set(wire.id, { points: [], hops: [] });
      polylines.push(null);
      return;
    }

    const from = portPosition(source, sourcePort);
    const to = portPosition(target, targetPort);
    const fromNormal = outwardNormal(sourcePort.side);
    const toNormal = outwardNormal(targetPort.side);
    const startCell = grid.cellAt(
      from.x + fromNormal.x * CELL,
      from.y + fromNormal.y * CELL,
    );
    const goalCell = grid.cellAt(
      to.x + toNormal.x * CELL,
      to.y + toNormal.y * CELL,
    );

    const cellPath = search(grid, wireOwner, index, startCell, goalCell);
    if (!cellPath) {
      // No clear lane — fall back to a plain elbow so the wire still connects.
      const elbow = elbowPath(from, to, sourcePort.side);
      routes.set(wire.id, { points: elbow, hops: [] });
      polylines.push(elbow);
      return;
    }

    for (const cell of cellPath) {
      const flat = cell.r * grid.cols + cell.c;
      if (wireOwner[flat] < 0) {
        wireOwner[flat] = index;
      }
    }

    const body = simplify(
      cellPath.map((cell) => ({ x: grid.toX(cell.c), y: grid.toY(cell.r) })),
    );
    const points = simplify([from, ...body, to]);
    routes.set(wire.id, { points, hops: [] });
    polylines.push(points);
  });

  addCrossingHops(diagram, routes, polylines);
  return routes;
}

// ── GRID ───────────────────────────────────────────────────────────────────

/** The occupancy grid plus the transforms between canvas and cell space. */
interface RouteGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
  cellAt: (x: number, y: number) => { c: number; r: number };
  toX: (c: number) => number;
  toY: (r: number) => number;
  inside: (c: number, r: number) => boolean;
}

/**
 * Build the routing grid, marking every cell a block footprint covers as
 * blocked so no wire can pass under a component.
 *
 * @param diagram - The diagram to model.
 * @returns The grid and its coordinate helpers.
 */
function buildGrid(diagram: RtlDiagram): RouteGrid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of diagram.blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + block.width);
    maxY = Math.max(maxY, block.y + block.height);
  }

  const originC = Math.floor(minX / CELL) - MARGIN_CELLS;
  const originR = Math.floor(minY / CELL) - MARGIN_CELLS;
  const cols = Math.ceil(maxX / CELL) + MARGIN_CELLS - originC + 1;
  const rows = Math.ceil(maxY / CELL) + MARGIN_CELLS - originR + 1;

  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
  const inside = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows;

  const blocked = new Uint8Array(cols * rows);
  for (const block of diagram.blocks) {
    const c0 = Math.round(block.x / CELL) - originC;
    const c1 = Math.round((block.x + block.width) / CELL) - originC;
    const r0 = Math.round(block.y / CELL) - originR;
    const r1 = Math.round((block.y + block.height) / CELL) - originR;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (inside(c, r)) {
          blocked[r * cols + c] = 1;
        }
      }
    }
  }

  return {
    cols,
    rows,
    blocked,
    cellAt: (x, y) => ({
      c: clamp(Math.round(x / CELL) - originC, cols),
      r: clamp(Math.round(y / CELL) - originR, rows),
    }),
    toX: (c) => (c + originC) * CELL,
    toY: (r) => (r + originR) * CELL,
    inside,
  };
}

// ── A* SEARCH ──────────────────────────────────────────────────────────────

/**
 * A* from one cell to another, 4-connected, minimising length plus a turn
 * penalty plus a penalty for reusing another wire's cells.
 *
 * @param grid - The routing grid.
 * @param wireOwner - Per-cell index of the wire that already claims it, or -1.
 * @param selfIndex - The index of the wire being routed (its own cells are free).
 * @param start - Start cell.
 * @param goal - Goal cell.
 * @returns The cell path inclusive of both ends, or null if none exists.
 */
function search(
  grid: RouteGrid,
  wireOwner: Int32Array,
  selfIndex: number,
  start: { c: number; r: number },
  goal: { c: number; r: number },
): { c: number; r: number }[] | null {
  const { cols, rows, blocked } = grid;
  const startNode = start.r * cols + start.c;
  const goalNode = goal.r * cols + goal.c;
  if (startNode === goalNode) {
    return [start];
  }

  const stateCount = cols * rows * 3;
  const cost = new Float64Array(stateCount).fill(Infinity);
  const from = new Int32Array(stateCount).fill(-1);
  const heuristic = (node: number) => {
    const c = node % cols;
    const r = (node - c) / cols;
    return Math.abs(c - goal.c) + Math.abs(r - goal.r);
  };

  const open = new MinHeap();
  const startState = startNode * 3 + DIR_NONE;
  cost[startState] = 0;
  open.push(startState, heuristic(startNode));

  while (open.size > 0) {
    const state = open.pop();
    const node = Math.floor(state / 3);
    const dir = state % 3;
    if (node === goalNode) {
      return reconstruct(from, state, cols);
    }
    const c = node % cols;
    const r = (node - c) / cols;
    for (const [dc, dr, stepDir] of STEPS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.inside(nc, nr)) {
        continue;
      }
      const nextNode = nr * cols + nc;
      if (blocked[nextNode] === 1 && nextNode !== goalNode) {
        continue;
      }
      let step = 1;
      if (dir !== DIR_NONE && dir !== stepDir) {
        step += TURN_COST;
      }
      const owner = wireOwner[nextNode];
      if (owner >= 0 && owner !== selfIndex) {
        step += SHARED_WIRE_COST;
      }
      const nextState = nextNode * 3 + stepDir;
      const tentative = cost[state] + step;
      if (tentative < cost[nextState]) {
        cost[nextState] = tentative;
        from[nextState] = state;
        open.push(nextState, tentative + heuristic(nextNode));
      }
    }
  }
  return null;
}

/**
 * Walk the predecessor table back from a goal state to the start.
 *
 * @param from - Predecessor state for every state, or -1.
 * @param goalState - The state the search finished on.
 * @param cols - Grid width, to decode nodes.
 * @returns Cells from start to goal in order.
 */
function reconstruct(
  from: Int32Array,
  goalState: number,
  cols: number,
): { c: number; r: number }[] {
  const cells: { c: number; r: number }[] = [];
  let state = goalState;
  while (state >= 0) {
    const node = Math.floor(state / 3);
    const c = node % cols;
    cells.push({ c, r: (node - c) / cols });
    state = from[state];
  }
  return cells.reverse();
}

// ── GEOMETRY HELPERS ───────────────────────────────────────────────────────

/**
 * Drop points that lie on the straight line between their neighbours, leaving
 * only the polyline's corners.
 *
 * @param points - A polyline, possibly with redundant collinear points.
 * @returns The same shape with interior collinear points removed.
 */
function simplify(points: Point[]): Point[] {
  if (points.length <= 2) {
    return points.slice();
  }
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const here = points[i];
    const next = points[i + 1];
    const collinearX = prev.x === here.x && here.x === next.x;
    const collinearY = prev.y === here.y && here.y === next.y;
    if (!collinearX && !collinearY) {
      out.push(here);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * A two-segment orthogonal path that leaves `from` along `sourceSide` before
 * turning toward `to`. Used both as a last resort when A* finds no lane, and
 * to draw the live click-to-connect preview line (which has no second port to
 * route against yet, just the pointer).
 *
 * @param from - Source port anchor.
 * @param to - Target port anchor, or the current pointer position.
 * @param sourceSide - Which side the source port leaves from.
 * @returns A three-point elbow polyline.
 */
export function elbowPath(from: Point, to: Point, sourceSide: string): Point[] {
  const horizontalFirst = sourceSide === "left" || sourceSide === "right";
  const corner = horizontalFirst
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y };
  return simplify([from, corner, to]);
}

/**
 * Record a hop on every place a newer wire's straight run crosses an older
 * wire's straight run at right angles.
 *
 * @param diagram - The diagram, for wire order.
 * @param routes - The route map to annotate in place.
 * @param polylines - Each wire's polyline (or null), indexed like the diagram.
 */
function addCrossingHops(
  diagram: RtlDiagram,
  routes: Map<string, RoutedWire>,
  polylines: (Point[] | null)[],
): void {
  for (let i = 0; i < diagram.wires.length; i += 1) {
    const newer = polylines[i];
    const route = routes.get(diagram.wires[i].id);
    if (!newer || !route) {
      continue;
    }
    for (let j = 0; j < i; j += 1) {
      const older = polylines[j];
      if (!older) {
        continue;
      }
      for (let a = 0; a < newer.length - 1; a += 1) {
        for (let b = 0; b < older.length - 1; b += 1) {
          const hit = crossPoint(
            newer[a],
            newer[a + 1],
            older[b],
            older[b + 1],
          );
          if (hit) {
            route.hops.push(hit);
          }
        }
      }
    }
  }
}

/**
 * Intersection of a horizontal and a vertical axis-aligned segment, if the two
 * genuinely cross (not merely touch at a shared endpoint).
 *
 * @param a1 - First endpoint of segment A.
 * @param a2 - Second endpoint of segment A.
 * @param b1 - First endpoint of segment B.
 * @param b2 - Second endpoint of segment B.
 * @returns The crossing point tagged with segment A's orientation, or null.
 */
function crossPoint(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): WireHop | null {
  const aHorizontal = a1.y === a2.y;
  const bHorizontal = b1.y === b2.y;
  if (aHorizontal === bHorizontal) {
    return null;
  }
  const h1 = aHorizontal ? a1 : b1;
  const h2 = aHorizontal ? a2 : b2;
  const v1 = aHorizontal ? b1 : a1;
  const v2 = aHorizontal ? b2 : a2;
  const x = v1.x;
  const y = h1.y;
  const withinH = x > Math.min(h1.x, h2.x) && x < Math.max(h1.x, h2.x);
  const withinV = y > Math.min(v1.y, v2.y) && y < Math.max(v1.y, v2.y);
  if (!withinH || !withinV) {
    return null;
  }
  return { x, y, horizontal: aHorizontal };
}

/**
 * Find the point at the midpoint of a polyline's total length — the visual
 * center of a routed wire — rather than an arbitrary vertex. A plain
 * index-based midpoint (`points[points.length / 2]`) lands on an endpoint for
 * the common two-point straight wire, pinning the label to one end instead of
 * the middle.
 *
 * @param points - The polyline to measure.
 * @returns The point at 50% of the polyline's cumulative length.
 */
export function midpointOfPolyline(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return points[0];
  }

  const segmentLengths = points
    .slice(1)
    .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  const halfLength = segmentLengths.reduce((sum, length) => sum + length, 0) / 2;

  let travelled = 0;
  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    if (travelled + length >= halfLength || i === segmentLengths.length - 1) {
      const t = length === 0 ? 0 : (halfLength - travelled) / length;
      const start = points[i];
      const end = points[i + 1];
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    travelled += length;
  }
  return points[points.length - 1];
}

/**
 * Turn a routed wire into an SVG path string, replacing each recorded crossing
 * with a small semicircular hop.
 *
 * @param route - The wire's polyline and hops.
 * @returns A `d` attribute for a `<path>`, or an empty string for no route.
 */
export function routeToPath(route: RoutedWire): string {
  const { points, hops } = route;
  if (points.length < 2) {
    return "";
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const horizontal = start.y === end.y;
    const onSegment = hops
      .filter((hop) =>
        horizontal
          ? hop.y === start.y &&
            hop.x > Math.min(start.x, end.x) &&
            hop.x < Math.max(start.x, end.x)
          : hop.x === start.x &&
            hop.y > Math.min(start.y, end.y) &&
            hop.y < Math.max(start.y, end.y),
      )
      .sort((p, q) =>
        horizontal
          ? (start.x < end.x ? p.x - q.x : q.x - p.x)
          : (start.y < end.y ? p.y - q.y : q.y - p.y),
      );

    for (const hop of onSegment) {
      if (horizontal) {
        const dir = start.x < end.x ? 1 : -1;
        d += ` L ${hop.x - dir * HOP_RADIUS} ${hop.y}`;
        d += ` A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${dir === 1 ? 1 : 0} ${
          hop.x + dir * HOP_RADIUS
        } ${hop.y}`;
      } else {
        const dir = start.y < end.y ? 1 : -1;
        d += ` L ${hop.x} ${hop.y - dir * HOP_RADIUS}`;
        d += ` A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${dir === 1 ? 0 : 1} ${
          hop.x
        } ${hop.y + dir * HOP_RADIUS}`;
      }
    }
    d += ` L ${end.x} ${end.y}`;
  }
  return d;
}
