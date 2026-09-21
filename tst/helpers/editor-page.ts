/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import { expect, type Locator, type Page } from "@playwright/test";
import type { RtlDiagram } from "../../src/shared/diagram-model";
import type { MainProcessDialogs } from "./main-dialogs";
import type { Workspace } from "./workspace";

/** A point in window (client) coordinates. */
export interface ClientPoint {
  x: number;
  y: number;
}

/** The canvas pan/zoom, read back off the live React Flow viewport. */
export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

/** File name every {@link EditorPage.persistedDiagram} round-trip saves through. */
const ROUND_TRIP_FILE = "round-trip.rtlproj";

/**
 * Page object for the editor window: one place that knows how the UI is
 * addressed, so a spec reads as user intent ("drop a Register at 300,200") and
 * a markup change is fixed in one file.
 */
export class EditorPage {
  /**
   * @param page - The Electron renderer page.
   * @param dialogs - Stubbed main-process file dialogs.
   * @param workspace - Temp directory backing saves, exports, and fixtures.
   */
  constructor(
    readonly page: Page,
    readonly dialogs: MainProcessDialogs,
    readonly workspace: Workspace,
  ) {}

  // ── TOOLBAR ───────────────────────────────────────────────────────────────

  /** @returns The top application bar. */
  get toolbar(): Locator {
    return this.page.locator(".toolbar");
  }

  /**
   * A toolbar action button. New/Open/Save live under the "File" dropdown and
   * PNG/SVG under "Export" (see ToolbarMenu.tsx) — open the matching menu
   * with {@link openMenu} first, or this won't find them (Undo/Redo and the
   * two menu triggers themselves stay directly clickable).
   *
   * @param name - Its visible label, e.g. "Save".
   * @returns The button locator.
   */
  action(name: string): Locator {
    return this.toolbar.getByRole("button", { name, exact: true });
  }

  /**
   * Open one of the toolbar's grouped-action dropdowns (see ToolbarMenu.tsx),
   * so the items inside — otherwise unmounted while closed — become
   * available to {@link action}.
   *
   * @param label - The menu's trigger label, e.g. "File" or "Export".
   */
  async openMenu(label: "File" | "Export"): Promise<void> {
    await this.action(label).click();
  }

  /** @returns The editable document title field. */
  get titleInput(): Locator {
    return this.page.getByLabel("Diagram title");
  }

  /** @returns The unsaved-changes dot, present only while the doc is dirty. */
  get dirtyIndicator(): Locator {
    return this.page.locator(".toolbar__dirty");
  }

  // ── PALETTE ───────────────────────────────────────────────────────────────

  /** @returns The left component palette. */
  get palette(): Locator {
    return this.page.locator(".palette");
  }

  /** @returns Every palette entry, in display order. */
  get paletteItems(): Locator {
    return this.page.locator(".palette__item");
  }

  /**
   * One palette entry.
   *
   * @param displayName - The component's palette label, e.g. "I/O Port".
   * @returns The entry's button.
   */
  paletteItem(displayName: string): Locator {
    return this.page.locator(
      `.palette__item:has(.palette__label:text-is("${displayName}"))`,
    );
  }

  /** @returns The collapse/expand rail button. */
  get paletteToggle(): Locator {
    return this.page.locator(".palette__toggle");
  }

  // ── CANVAS ────────────────────────────────────────────────────────────────

  /** @returns The canvas container that owns the drop target. */
  get canvas(): Locator {
    return this.page.locator(".canvas");
  }

  /** @returns The React Flow pane that receives background clicks. */
  get pane(): Locator {
    return this.page.locator(".react-flow__pane");
  }

  /** @returns Every rendered block. */
  get nodes(): Locator {
    return this.page.locator(".react-flow__node");
  }

  /** @returns Every rendered wire. */
  get edges(): Locator {
    return this.page.locator(".react-flow__edge");
  }

  /** @returns The grid-snapped preview shown while dragging in from the palette. */
  get dragPreview(): Locator {
    return this.page.locator(".drag-preview");
  }

  /** @returns The red overlay marking a block dragged somewhere it can't land. */
  get invalidOverlay(): Locator {
    return this.page.locator(".invalid-placement-overlay");
  }

  /** @returns The adaptive grid background, absent while the grid is hidden. */
  get gridBackground(): Locator {
    return this.canvas.locator("svg.react-flow__background");
  }

  /** @returns The on-canvas zoom / fit / lock control cluster. */
  get controls(): Locator {
    return this.page.locator(".react-flow__controls");
  }

  /** @returns The overview minimap. */
  get miniMap(): Locator {
    return this.page.locator(".react-flow__minimap");
  }

  /**
   * One block, addressed by the name shown in its header.
   *
   * @param label - The block's displayed name, e.g. "Module 1".
   * @returns The React Flow node element.
   */
  blockNode(label: string): Locator {
    // Labels come out of documents that may be hand-edited, so a quote or a
    // backslash in one must not break out of the selector string.
    const quoted = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return this.page.locator(
      `.react-flow__node:has(.rtl-block__title:text-is("${quoted}"))`,
    );
  }

  /**
   * One wire, addressed by its model id.
   *
   * @param wireId - The wire's id in the diagram document.
   * @returns The React Flow edge element.
   */
  edge(wireId: string): Locator {
    return this.page.locator(`.react-flow__edge[data-id="${wireId}"]`);
  }

  // ── INSPECTOR ─────────────────────────────────────────────────────────────

  /** @returns The right properties panel. */
  get inspector(): Locator {
    return this.page.locator(".inspector");
  }

  /** @returns The "N blocks · M wires" line, shown only without a single selection. */
  get documentStat(): Locator {
    return this.page.locator(".inspector__stat");
  }

  /** @returns The selected block's name field. */
  get blockNameInput(): Locator {
    return this.page.getByLabel("Block name");
  }

  /** @returns The selected block's width field, in grid cells. */
  get widthInput(): Locator {
    return this.inspector.locator(".field--row input").first();
  }

  /** @returns The selected block's height field, in grid cells. */
  get heightInput(): Locator {
    return this.inspector.locator(".field--row input").nth(1);
  }

  /** @returns Every port row of the selected block, in model order. */
  get portRows(): Locator {
    return this.page.locator(".port-row");
  }

  /**
   * One port row of the selected block, found by the name currently in its
   * field. Matched on the live input value rather than a `value` attribute:
   * React updates the property, and the attribute goes stale after an edit.
   *
   * @param portName - The port's current name.
   * @returns The row element.
   * @throws {Error} If no row carries that name.
   */
  async portRow(portName: string): Promise<Locator> {
    const index = await this.portRows.evaluateAll(
      (rows, name) =>
        rows.findIndex(
          (row) => (row.querySelector("input") as HTMLInputElement | null)?.value === name,
        ),
      portName,
    );
    if (index < 0) {
      throw new Error(`No port row named "${portName}" is on screen.`);
    }
    return this.portRows.nth(index);
  }

  /**
   * The names of the selected block's ports, in model order.
   *
   * @returns One name per port row.
   */
  async portNames(): Promise<string[]> {
    return this.portRows.evaluateAll((rows) =>
      rows.map((row) => (row.querySelector("input") as HTMLInputElement | null)?.value ?? ""),
    );
  }

  /** @returns The selected wire's endpoint summary line. */
  get wireEndpoints(): Locator {
    return this.inspector.locator(".inspector__muted").first();
  }

  // ── READINESS ─────────────────────────────────────────────────────────────

  /**
   * Wait until the shell and the canvas have rendered.
   *
   * @returns Nothing.
   */
  async waitForReady(): Promise<void> {
    await expect(this.toolbar).toBeVisible();
    await expect(this.pane).toBeVisible();
  }

  /**
   * Wait until the canvas has stopped panning/zooming.
   *
   * Opening a file, fitting the view, and the zoom controls all animate over
   * ~200ms. A click or drag issued mid-animation lands on stale coordinates —
   * the single most common source of flake in this suite — so every gesture
   * that depends on where things are on screen waits for two identical reads
   * of the viewport transform first.
   *
   * @returns Nothing.
   */
  async waitForViewportSettled(): Promise<void> {
    let previous: string | null = null;
    let matches = 0;
    await expect
      .poll(
        async () => {
          const current = await this.page
            .locator(".react-flow__viewport")
            .evaluate((element) => (element as HTMLElement).style.transform);
          matches = current === previous ? matches + 1 : 0;
          previous = current;
          // Three identical reads, not two: an animation triggered a moment
          // ago has not moved the transform yet, and two quick samples would
          // call that "settled" before it ever started.
          return matches >= 2;
        },
        { message: "Canvas viewport never stopped animating." },
      )
      .toBe(true);
  }

  // ── BLOCK CREATION ────────────────────────────────────────────────────────

  /**
   * Drop a component near the canvas origin the quick way — the palette's
   * double-click shortcut. Placement is fixed, so use {@link dragComponentTo}
   * whenever a test cares where the block lands.
   *
   * @param displayName - The component to add, e.g. "Module".
   * @returns Nothing.
   */
  async addComponent(displayName: string): Promise<void> {
    const before = await this.nodes.count();
    await this.paletteItem(displayName).dblclick();
    await expect(this.nodes).toHaveCount(before + 1);
  }

  /**
   * Drag a component out of the palette and drop it on the canvas.
   *
   * Driven as real HTML5 drag events rather than a mouse gesture: the palette
   * hands the block kind over on a `dataTransfer` payload, which only exists on
   * a genuine drag event sequence.
   *
   * @param displayName - The component to drag, e.g. "Register".
   * @param at - Where to drop it, in client coordinates.
   * @param options.expectRejected - Set when the drop should be refused, so no
   *   new block is awaited.
   * @returns Nothing.
   */
  async dragComponentTo(
    displayName: string,
    at: ClientPoint,
    options: { expectRejected?: boolean } = {},
  ): Promise<void> {
    const before = await this.nodes.count();
    await this.beginComponentDrag(displayName);
    await this.dragOverCanvas(at);
    await this.dropOnCanvas(at);
    await this.endComponentDrag(displayName);
    await expect(this.nodes).toHaveCount(options.expectRejected ? before : before + 1);
  }

  /**
   * Start a palette drag without dropping it, leaving the preview live.
   *
   * @param displayName - The component being dragged.
   * @returns Nothing.
   * @throws {Error} If that palette item is not on screen.
   */
  async beginComponentDrag(displayName: string): Promise<void> {
    const item = this.paletteItem(displayName);
    const box = await item.boundingBox();
    if (!box) {
      throw new Error(`Palette item "${displayName}" is not visible.`);
    }
    await item.evaluate(
      (element, origin) => {
        const transfer = new DataTransfer();
        (window as unknown as { __rtlDrag?: DataTransfer }).__rtlDrag = transfer;
        element.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: origin.x,
            clientY: origin.y,
          }),
        );
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
  }

  /**
   * Move the in-flight palette drag over a point on the canvas.
   *
   * @param at - Pointer position in client coordinates.
   * @returns Nothing.
   */
  async dragOverCanvas(at: ClientPoint): Promise<void> {
    await this.dispatchCanvasDrag("dragover", at);
  }

  /**
   * Release the in-flight palette drag over a point on the canvas.
   *
   * @param at - Drop position in client coordinates.
   * @returns Nothing.
   */
  async dropOnCanvas(at: ClientPoint): Promise<void> {
    await this.dispatchCanvasDrag("drop", at);
  }

  /**
   * Leave the canvas without dropping, as a drag heading back to the palette.
   *
   * @returns Nothing.
   */
  async dragLeaveCanvas(): Promise<void> {
    await this.canvas.evaluate((element) => {
      const transfer = (window as unknown as { __rtlDrag?: DataTransfer }).__rtlDrag;
      element.dispatchEvent(
        new DragEvent("dragleave", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });
  }

  /**
   * End a palette drag the way the browser does after a drop *or* a cancel.
   *
   * @param displayName - The component that was being dragged.
   * @returns Nothing.
   */
  async endComponentDrag(displayName: string): Promise<void> {
    await this.paletteItem(displayName).evaluate((element) => {
      const transfer = (window as unknown as { __rtlDrag?: DataTransfer }).__rtlDrag;
      element.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });
  }

  /**
   * Dispatch one drag event on the canvas carrying the in-flight payload.
   *
   * @param type - The drag event type to fire.
   * @param at - Pointer position in client coordinates.
   * @returns Nothing.
   */
  private async dispatchCanvasDrag(
    type: "dragover" | "drop",
    at: ClientPoint,
  ): Promise<void> {
    await this.canvas.evaluate(
      (element, detail) => {
        const transfer = (window as unknown as { __rtlDrag?: DataTransfer }).__rtlDrag;
        element.dispatchEvent(
          new DragEvent(detail.type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: detail.x,
            clientY: detail.y,
          }),
        );
      },
      { type, x: at.x, y: at.y },
    );
  }

  /**
   * Drag a component onto a specific spot in the diagram's own coordinate
   * space, converting through the live pan/zoom. Diagram coordinates are what
   * the model stores and what collision rules are expressed in, so a test that
   * cares about placement should think in them rather than in screen pixels.
   *
   * @param displayName - The component to drag, e.g. "Register".
   * @param center - Where the block's centre should land, in diagram units.
   * @param options.expectRejected - Set when the drop should be refused.
   * @returns Nothing.
   */
  async placeComponentAt(
    displayName: string,
    center: { x: number; y: number },
    options: { expectRejected?: boolean } = {},
  ): Promise<void> {
    await this.dragComponentTo(displayName, await this.clientPointFor(center), options);
  }

  // ── ZOOM ──────────────────────────────────────────────────────────────────

  /** @returns The canvas control that zooms out one step. */
  get zoomOutButton(): Locator {
    return this.controls.locator(".react-flow__controls-zoomout");
  }

  /** @returns The canvas control that zooms in one step. */
  get zoomInButton(): Locator {
    return this.controls.locator(".react-flow__controls-zoomin");
  }

  /** @returns The canvas control that fits the diagram in view. */
  get fitViewButton(): Locator {
    return this.controls.locator(".react-flow__controls-fitview");
  }

  /** @returns The canvas control that locks interaction. */
  get lockButton(): Locator {
    return this.controls.locator(".react-flow__controls-interactive");
  }

  /**
   * Zoom out until the canvas is at or below a given scale.
   *
   * The editor fits the view to the first block that appears, which lands at
   * the 2.5x maximum — too tight to place a second block beside it. A user
   * would zoom out; so does the suite, rather than pretending the viewport is
   * always 1:1.
   *
   * @param target - Zoom level to get at or under.
   * @returns The zoom finally reached.
   * @throws {Error} If the control cannot reach the target.
   */
  async zoomOutTo(target = 1): Promise<number> {
    for (let step = 0; step < 12; step += 1) {
      const { zoom } = await this.viewportTransform();
      if (zoom <= target) {
        return zoom;
      }
      // The keyboard chord, not the on-canvas control: repeated clicks on the
      // same button land inside the double-click window, and React Flow reads
      // the resulting dblclick as "zoom in", undoing the step.
      await this.page.keyboard.press("-");
      await this.waitForViewportSettled();
    }
    throw new Error(`Could not zoom out to ${target}.`);
  }

  // ── SELECTION & MOVEMENT ──────────────────────────────────────────────────

  /**
   * Click a block to select it.
   *
   * @param label - The block's displayed name.
   * @param options.additive - Hold Ctrl to add it to the current selection.
   * @returns Nothing.
   */
  async selectBlock(label: string, options: { additive?: boolean } = {}): Promise<void> {
    await this.waitForViewportSettled();
    // Clicking the node, not its header: the header carries
    // `pointer-events: none` so the block body owns every click.
    await this.blockNode(label).click({
      modifiers: options.additive ? ["Control"] : [],
    });
  }

  /**
   * Rubber-band select every block inside the box spanned by two placed
   * blocks, the way a user lassos a region with Shift held.
   *
   * @param corner - Displayed name of the block at one corner of the sweep.
   * @param opposite - Displayed name of the block at the far corner.
   * @param margin - Extra screen pixels to sweep beyond both blocks.
   * @returns Nothing.
   * @throws {Error} If either block is off screen.
   */
  async boxSelect(corner: string, opposite: string, margin = 30): Promise<void> {
    await this.waitForViewportSettled();
    const first = await this.blockNode(corner).boundingBox();
    const second = await this.blockNode(opposite).boundingBox();
    if (!first || !second) {
      throw new Error(`Both "${corner}" and "${opposite}" must be visible.`);
    }
    const start = {
      x: Math.min(first.x, second.x) - margin,
      y: Math.min(first.y, second.y) - margin,
    };
    const end = {
      x: Math.max(first.x + first.width, second.x + second.width) + margin,
      y: Math.max(first.y + first.height, second.y + second.height) + margin,
    };

    await this.page.keyboard.down("Shift");
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, { steps: 15 });
    await this.page.mouse.up();
    await this.page.keyboard.up("Shift");
  }

  /**
   * Click empty canvas, clearing the selection.
   *
   * @returns Nothing.
   * @throws {Error} If the canvas is not on screen.
   */
  async clickEmptyCanvas(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error("Canvas is not visible.");
    }
    // Bottom-left: clear of the palette, the controls (top-right) and the
    // minimap (bottom-right), all of which swallow the click.
    await this.page.mouse.click(box.x + 40, box.y + box.height - 140);
  }

  /**
   * Drag a block across the canvas with the mouse.
   *
   * @param label - The block's displayed name.
   * @param by - Screen-space offset to drag it by.
   * @param options.steps - Intermediate mouse moves; several are needed for
   *   React Flow's drag state machine and the collision preview to settle.
   * @returns Nothing.
   * @throws {Error} If that block is not on screen.
   */
  async dragBlockBy(
    label: string,
    by: { dx: number; dy: number },
    options: { steps?: number } = {},
  ): Promise<void> {
    await this.waitForViewportSettled();
    const box = await this.blockNode(label).boundingBox();
    if (!box) {
      throw new Error(`Block "${label}" is not visible.`);
    }
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + by.dx, from.y + by.dy, {
      steps: options.steps ?? 12,
    });
    await this.page.mouse.up();
  }

  // ── WIRING ────────────────────────────────────────────────────────────────

  /**
   * The React Flow handle id backing a named port, found through the label
   * rendered beside it so tests never need the generated port id.
   *
   * @param blockLabel - The owning block's displayed name.
   * @param portName - The port's name, e.g. "clk".
   * @returns The handle id.
   * @throws {Error} If the block has no port with that name.
   */
  async portHandleId(blockLabel: string, portName: string): Promise<string> {
    const handleId = await this.blockNode(blockLabel).evaluate((node, name) => {
      const labels = Array.from(node.querySelectorAll(".rtl-port__label"));
      // The label holds the port name as its first text node, with the optional
      // "[31:0]" width annotation in a trailing <em>.
      const match = labels.find(
        (label) => (label.childNodes[0]?.textContent ?? "").trim() === name,
      );
      return (
        match?.parentElement
          ?.querySelector(".react-flow__handle")
          ?.getAttribute("data-handleid") ?? ""
      );
    }, portName);

    if (!handleId) {
      throw new Error(`Block "${blockLabel}" has no port named "${portName}".`);
    }
    return handleId;
  }

  /**
   * The connection point of one port.
   *
   * @param blockLabel - The owning block's displayed name.
   * @param portName - The port's name.
   * @returns The handle element.
   */
  async portHandle(blockLabel: string, portName: string): Promise<Locator> {
    const handleId = await this.portHandleId(blockLabel, portName);
    return this.blockNode(blockLabel).locator(
      `.react-flow__handle[data-handleid="${handleId}"]`,
    );
  }

  /**
   * Draw a wire with click-to-connect: click one port's handle to arm it,
   * then click the other to complete the wire.
   *
   * @param source.block - Displayed name of the driving block.
   * @param source.port - Name of the output port.
   * @param target.block - Displayed name of the receiving block.
   * @param target.port - Name of the input port.
   * @returns Nothing.
   */
  async connect(
    source: { block: string; port: string },
    target: { block: string; port: string },
  ): Promise<void> {
    await this.waitForViewportSettled();
    await (await this.portHandle(source.block, source.port)).click();
    await (await this.portHandle(target.block, target.port)).click();
  }

  /**
   * Click a wire on its midpoint.
   *
   * An edge is a thin <g> whose bounding-box centre usually misses the stroke,
   * so the point is taken off the path itself and mapped to screen space.
   *
   * @param index - Which wire, in render order.
   * @returns Nothing.
   */
  async selectWire(index = 0): Promise<void> {
    await this.waitForViewportSettled();
    const point = await this.edges.nth(index).evaluate((group) => {
      const path = group.querySelector("path.react-flow__edge-path") as SVGPathElement | null;
      const matrix = path?.getScreenCTM();
      if (!path || !matrix) {
        throw new Error("Edge has no rendered path.");
      }
      const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
      return {
        x: matrix.a * midpoint.x + matrix.c * midpoint.y + matrix.e,
        y: matrix.b * midpoint.x + matrix.d * midpoint.y + matrix.f,
      };
    });
    await this.page.mouse.click(point.x, point.y);
  }

  // ── VIEWPORT GEOMETRY ─────────────────────────────────────────────────────

  /**
   * The canvas's current pan and zoom, parsed off its transform.
   *
   * @returns The live viewport transform.
   * @throws {Error} If the transform is not in the expected translate/scale form.
   */
  async viewportTransform(): Promise<ViewportTransform> {
    const transform = await this.page
      .locator(".react-flow__viewport")
      .evaluate((element) => (element as HTMLElement).style.transform);
    // Numbers can arrive in exponent form ("7.02e-05px") once a pan lands on a
    // near-zero offset, so the pattern accepts more than digits and dots.
    const match = /translate\(([-+\d.eE]+)px,\s*([-+\d.eE]+)px\)\s*scale\(([-+\d.eE]+)\)/.exec(
      transform,
    );
    if (!match) {
      throw new Error(`Unrecognized viewport transform: "${transform}"`);
    }
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
  }

  /**
   * A point measured from the canvas's top-left corner.
   *
   * @param dx - Horizontal offset in screen pixels.
   * @param dy - Vertical offset in screen pixels.
   * @returns The point in client coordinates.
   * @throws {Error} If the canvas is not on screen.
   */
  async canvasPoint(dx: number, dy: number): Promise<ClientPoint> {
    const box = await this.canvas.boundingBox();
    if (!box) {
      throw new Error("Canvas is not visible.");
    }
    return { x: box.x + dx, y: box.y + dy };
  }

  /**
   * Convert a client point into diagram coordinates, the way the app does when
   * it decides where a dropped block lands.
   *
   * @param at - A point in client coordinates.
   * @returns The equivalent diagram coordinates.
   * @throws {Error} If the flow pane is not on screen.
   */
  async toFlowPoint(at: ClientPoint): Promise<{ x: number; y: number }> {
    const box = await this.page.locator(".react-flow").boundingBox();
    const viewport = await this.viewportTransform();
    if (!box) {
      throw new Error("React Flow pane is not visible.");
    }
    return {
      x: (at.x - box.x - viewport.x) / viewport.zoom,
      y: (at.y - box.y - viewport.y) / viewport.zoom,
    };
  }

  /**
   * Convert diagram coordinates back into a client point on screen.
   *
   * @param at - A point in diagram coordinates.
   * @returns The equivalent client coordinates.
   * @throws {Error} If that point is currently scrolled off the canvas, which
   *   would otherwise surface as a confusing "nothing happened" failure.
   */
  async clientPointFor(at: { x: number; y: number }): Promise<ClientPoint> {
    const box = await this.canvas.boundingBox();
    const viewport = await this.viewportTransform();
    if (!box) {
      throw new Error("Canvas is not visible.");
    }
    const point = {
      x: box.x + viewport.x + at.x * viewport.zoom,
      y: box.y + viewport.y + at.y * viewport.zoom,
    };
    const inside =
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height;
    if (!inside) {
      throw new Error(
        `Diagram point (${at.x}, ${at.y}) is off screen at zoom ${viewport.zoom}.`,
      );
    }
    return point;
  }

  // ── DOCUMENT ROUND-TRIP ───────────────────────────────────────────────────

  /**
   * Save the document and read it back off disk.
   *
   * This is the suite's window onto model state, and it runs the real save path
   * (renderer → IPC → main → file), so what a test asserts on is what the user
   * would actually get in their `.rtlproj`. It clears the dirty flag and rebinds
   * the document to the round-trip file as side effects — check the dirty
   * indicator *before* calling it.
   *
   * @returns The persisted document.
   */
  async persistedDiagram(): Promise<RtlDiagram> {
    const target = this.workspace.path(ROUND_TRIP_FILE);
    this.workspace.remove(target);
    await this.dialogs.stub({ save: target });
    // Save As, not Save: a document opened from disk already has a path and
    // would quietly overwrite that instead of the round-trip file.
    await this.page.keyboard.press("Control+Shift+S");
    return this.workspace.readDiagramWhenWritten(target);
  }

  /**
   * Open a document through the toolbar, with the dialog answering `path`.
   *
   * @param path - Absolute path the stubbed open dialog returns.
   * @returns Nothing.
   */
  async openDocument(path: string): Promise<void> {
    await this.dialogs.stub({ open: path });
    await this.openMenu("File");
    await this.action("Open").click();
    // The open handler fits the view with an animation; nothing measured
    // before it lands is trustworthy.
    await this.waitForViewportSettled();
  }
}
