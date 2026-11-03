/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Getting a block onto the canvas: the palette's contents, its collapse rail,
// and both placement gestures (double-click and drag-and-drop) — including the
// two ways a drag can end without placing anything.

import { expect, test } from "../fixtures/editor-fixture";
import { GRID } from "../data/diagrams";
import type { ClientPoint, EditorPage } from "../helpers/editor-page";

/** Default footprint of a Module, in canvas units (12 x 8 grid cells). */
const MODULE_SIZE = { width: 12 * GRID, height: 8 * GRID };

/**
 * Round a coordinate the way the editor snaps a dropped block.
 *
 * @param value - A raw canvas coordinate.
 * @returns The nearest gridline.
 */
function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/**
 * The centre of a placed block, in client coordinates.
 *
 * @param editor - The editor page object.
 * @param label - The block's displayed name.
 * @returns The block's centre on screen.
 * @throws {Error} If the block is not visible.
 */
async function centerOf(editor: EditorPage, label: string): Promise<ClientPoint> {
  const box = await editor.blockNode(label).boundingBox();
  if (!box) {
    throw new Error(`Block "${label}" is not visible.`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("component palette", () => {
  test("lists every component the library offers", async ({ editor }) => {
    await expect(editor.paletteItems).toHaveText([
      "Module",
      "Register",
      "Gate",
      "Codec",
      "Multiplexer",
      "I/O Port",
      "Constant",
    ]);
  });

  test("each entry carries a hint", async ({ editor }) => {
    const count = await editor.paletteItems.count();
    for (let index = 0; index < count; index += 1) {
      await expect(editor.paletteItems.nth(index)).toHaveAttribute("title", /\S/);
    }
  });

  test("collapses to a rail and expands again", async ({ editor }) => {
    await expect(editor.paletteToggle).toHaveAttribute("aria-label", "Collapse panel");

    await editor.paletteToggle.click();
    await expect(editor.paletteItems).toHaveCount(0);
    await expect(editor.paletteToggle).toHaveAttribute("aria-label", "Expand panel");

    await editor.paletteToggle.click();
    await expect(editor.paletteItems).toHaveCount(7);
  });

  test("double-click drops a block", async ({ editor }) => {
    await editor.addComponent("Module");
    await expect(editor.blockNode("Module 1")).toBeVisible();
    await expect(editor.nodes).toHaveCount(1);
  });

  test("auto-numbers per component base name", async ({ editor }) => {
    // The first block lands at (80, 80) and the view fits to it at 2.5x, which
    // leaves no room beside it — zoom out the way a user would before placing
    // the next two clear of it.
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);
    await editor.placeComponentAt("Module", { x: 500, y: 150 });
    await editor.placeComponentAt("I/O Port", { x: 500, y: 400 });

    await expect(editor.blockNode("Module 1")).toBeVisible();
    await expect(editor.blockNode("Module 2")).toBeVisible();
    await expect(editor.blockNode("Port 1")).toBeVisible();
  });

  test("drag-and-drop lands under the cursor, on the grid", async ({ editor }) => {
    const at = await editor.canvasPoint(500, 320);
    const flowPoint = await editor.toFlowPoint(at);
    await editor.dragComponentTo("Module", at);

    // The block is centred on the drop point, then snapped to a gridline.
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks).toHaveLength(1);
    expect(diagram.blocks[0]).toMatchObject({
      kind: "module",
      x: snap(flowPoint.x - MODULE_SIZE.width / 2),
      y: snap(flowPoint.y - MODULE_SIZE.height / 2),
      width: MODULE_SIZE.width,
      height: MODULE_SIZE.height,
    });
  });

  test("drag shows a preview and clears it on leave", async ({ editor }) => {
    await editor.beginComponentDrag("Register");
    await editor.dragOverCanvas(await editor.canvasPoint(500, 300));
    await expect(editor.dragPreview).toBeVisible();
    await expect(editor.dragPreview).toContainText("Register");

    await editor.dragLeaveCanvas();
    await expect(editor.dragPreview).toHaveCount(0);
    await editor.endComponentDrag("Register");
  });

  test("cancelled drag places nothing", async ({ editor }) => {
    await editor.beginComponentDrag("Module");
    await editor.dragOverCanvas(await editor.canvasPoint(500, 300));
    // Ending without a drop is what Escape / releasing off-target produces.
    await editor.endComponentDrag("Module");

    await expect(editor.nodes).toHaveCount(0);
    await expect(editor.dirtyIndicator).toHaveCount(0);
  });

  test("refuses a drop on top of an existing block", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);

    await editor.dragComponentTo("Register", await centerOf(editor, "Module 1"), {
      expectRejected: true,
    });
    await expect(editor.nodes).toHaveCount(1);
  });

  test("refuses a drop inside another block's routing clearance", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);

    // Module 1 occupies (80, 80)-(272, 208); a block centred one cell to its
    // right still eats the two-cell gap wires need to bend through.
    await editor.placeComponentAt("Register", { x: 272 + GRID, y: 144 }, {
      expectRejected: true,
    });
    await expect(editor.nodes).toHaveCount(1);
  });

  test("marks an occupied drop point as invalid before the drop", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);

    await editor.beginComponentDrag("Register");
    await editor.dragOverCanvas(await centerOf(editor, "Module 1"));
    const invalidColor = await editor.dragPreview.evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    );

    await editor.dragOverCanvas(await editor.clientPointFor({ x: 500, y: 400 }));
    const validColor = await editor.dragPreview.evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    );
    await editor.endComponentDrag("Register");

    expect(invalidColor).not.toBe(validColor);
  });
});
