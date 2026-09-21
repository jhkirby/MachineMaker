/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// The keyboard chords that replaced the native menu bar, and the rule that
// separates them: modifier chords fire anywhere, bare keys are canvas controls
// and must not fire while the user is typing in a field.

import { expect, test } from "../fixtures/editor-fixture";
import { twoBlockDiagram } from "../data/diagrams";

test.describe("keyboard shortcuts", () => {
  test("ctrl+z undoes and ctrl+y redoes", async ({ editor, page }) => {
    await editor.addComponent("Module");

    await page.keyboard.press("Control+z");
    await expect(editor.nodes).toHaveCount(0);

    await page.keyboard.press("Control+y");
    await expect(editor.nodes).toHaveCount(1);
  });

  test("ctrl+shift+z also redoes", async ({ editor, page }) => {
    await editor.addComponent("Module");
    await page.keyboard.press("Control+z");
    await expect(editor.nodes).toHaveCount(0);

    await page.keyboard.press("Control+Shift+z");
    await expect(editor.nodes).toHaveCount(1);
  });

  test("ctrl+s saves through the dialog", async ({ editor, workspace }) => {
    await editor.addComponent("Module");
    const target = workspace.path("chord.rtlproj");
    await editor.dialogs.stub({ save: target });

    await editor.page.keyboard.press("Control+s");

    const saved = await workspace.readDiagramWhenWritten(target);
    expect(saved.blocks).toHaveLength(1);
    await expect(editor.dirtyIndicator).toHaveCount(0);
  });

  test("ctrl+o opens a document", async ({ editor, workspace }) => {
    const path = workspace.writeDiagram("two.rtlproj", twoBlockDiagram());
    await editor.dialogs.stub({ open: path });

    await editor.page.keyboard.press("Control+o");

    await expect(editor.nodes).toHaveCount(2);
  });

  test("ctrl+n starts a new document", async ({ editor, page }) => {
    await editor.addComponent("Module");
    page.once("dialog", (dialog) => void dialog.accept());

    await page.keyboard.press("Control+n");

    await expect(editor.nodes).toHaveCount(0);
    await expect(editor.titleInput).toHaveValue("Untitled Diagram");
  });

  test("ctrl+g toggles the grid", async ({ editor, page }) => {
    await expect(editor.gridBackground).toBeVisible();

    await page.keyboard.press("Control+g");
    await expect(editor.gridBackground).toHaveCount(0);

    await page.keyboard.press("Control+g");
    await expect(editor.gridBackground).toBeVisible();
  });

  test("minus and plus zoom the canvas", async ({ editor, page }) => {
    const start = (await editor.viewportTransform()).zoom;

    await page.keyboard.press("-");
    // Polling rather than one read: the zoom is animated, so it is not on its
    // final value the instant the key is released.
    await expect.poll(async () => (await editor.viewportTransform()).zoom).toBeLessThan(start);
    const zoomedOut = (await editor.viewportTransform()).zoom;

    await page.keyboard.press("+");
    await expect
      .poll(async () => (await editor.viewportTransform()).zoom)
      .toBeGreaterThan(zoomedOut);
  });

  test("escape clears the selection", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.selectBlock("ALU Core");
    await expect(editor.blockNameInput).toBeVisible();

    await page.keyboard.press("Escape");

    // Nothing is selected any more, so the inspector slides shut.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("l locks the canvas against edits", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await page.keyboard.press("l");

    await editor.blockNode("ALU Core").click();

    await expect(editor.blockNode("ALU Core")).not.toHaveClass(/selected/);
    // The click was blocked by the lock, so nothing got selected and the
    // inspector stays closed.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("c fits the diagram in view", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    const start = (await editor.viewportTransform()).zoom;
    await page.keyboard.press("-");
    await page.keyboard.press("-");
    await expect.poll(async () => (await editor.viewportTransform()).zoom).toBeLessThan(start);
    const zoomedOut = (await editor.viewportTransform()).zoom;

    await page.keyboard.press("c");

    await expect
      .poll(async () => (await editor.viewportTransform()).zoom)
      .toBeGreaterThan(zoomedOut);
  });

  test("bare keys do not fire while typing in a field", async ({ editor, page }) => {
    const before = await editor.viewportTransform();

    // "Cell-" contains c (fit view), l (lock) and - (zoom out): every bare-key
    // chord must stay inert while the caret is in a text field.
    await editor.titleInput.click();
    await editor.titleInput.fill("Cell");
    await page.keyboard.type("-");

    await expect(editor.titleInput).toHaveValue("Cell-");
    expect((await editor.viewportTransform()).zoom).toBeCloseTo(before.zoom, 5);
  });

  test("modifier chords still fire while typing in a field", async ({ editor, page }) => {
    await editor.addComponent("Module");
    await editor.titleInput.click();

    await page.keyboard.press("Control+z");

    await expect(editor.nodes).toHaveCount(0);
  });

  test("alt chords are ignored", async ({ editor, page }) => {
    await editor.addComponent("Module");

    await page.keyboard.press("Alt+z");

    await expect(editor.nodes).toHaveCount(1);
  });
});
