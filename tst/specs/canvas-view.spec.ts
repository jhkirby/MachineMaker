/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// The view controls that sit on the canvas — zoom, fit, lock, the minimap, and
// the grid — and the line between what they change (the view) and what they
// must never change (the document).

import { expect, test } from "../fixtures/editor-fixture";
import { GRID, gridDiagram, twoBlockDiagram } from "../data/diagrams";

test.describe("canvas view", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await expect(editor.nodes).toHaveCount(2);
  });

  test("the zoom controls step in and out", async ({ editor }) => {
    const start = (await editor.viewportTransform()).zoom;

    await editor.zoomOutButton.click();
    await expect
      .poll(async () => (await editor.viewportTransform()).zoom)
      .toBeLessThan(start);

    await editor.zoomInButton.click();
    await expect
      .poll(async () => (await editor.viewportTransform()).zoom)
      .toBeCloseTo(start, 2);
  });

  test("fit view brings every block on screen", async ({ editor }) => {
    await editor.zoomOutTo(0.3);

    await editor.fitViewButton.click();
    await editor.waitForViewportSettled();

    const canvas = await editor.canvas.boundingBox();
    for (const label of ["ALU Core", "Pipe Reg"]) {
      const box = await editor.blockNode(label).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(canvas!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width);
      expect(box!.y).toBeGreaterThanOrEqual(canvas!.y);
      expect(box!.y + box!.height).toBeLessThanOrEqual(canvas!.y + canvas!.height);
    }
  });

  test("zooming never edits the document", async ({ editor }) => {
    await editor.zoomOutTo(0.5);
    await editor.fitViewButton.click();

    await expect(editor.dirtyIndicator).toHaveCount(0);
    await expect(editor.action("Undo")).toBeDisabled();
  });

  test("the lock control blocks dragging and selection", async ({ editor }) => {
    await editor.zoomOutTo(1);
    await editor.lockButton.click();

    await editor.blockNode("ALU Core").click();
    await expect(editor.blockNode("ALU Core")).not.toHaveClass(/selected/);

    await editor.dragBlockBy("ALU Core", { dx: 0, dy: 160 });
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks.find((block) => block.label === "ALU Core")).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  test("unlocking restores editing", async ({ editor }) => {
    await editor.lockButton.click();
    await editor.lockButton.click();

    await editor.selectBlock("ALU Core");

    await expect(editor.blockNode("ALU Core")).toHaveClass(/selected/);
  });

  test("the minimap tracks the blocks", async ({ editor, workspace, page }) => {
    await expect(editor.miniMap.locator(".react-flow__minimap-node")).toHaveCount(2);

    page.once("dialog", (dialog) => void dialog.accept());
    const diagram = gridDiagram();
    await editor.openDocument(workspace.writeDiagram("big.rtlproj", diagram));

    await expect(editor.miniMap.locator(".react-flow__minimap-node")).toHaveCount(
      diagram.blocks.length,
    );
  });

  test("hiding the grid does not stop snapping", async ({ editor, page }) => {
    await page.keyboard.press("Control+g");
    await expect(editor.gridBackground).toHaveCount(0);
    await editor.zoomOutTo(1);

    await editor.placeComponentAt("Constant", { x: 500, y: 400 });

    const diagram = await editor.persistedDiagram();
    const added = diagram.blocks.find((block) => block.kind === "constant");
    expect((added?.x ?? 1) % GRID).toBe(0);
    expect((added?.y ?? 1) % GRID).toBe(0);
  });
});
