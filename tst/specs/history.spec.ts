/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Undo/redo: what counts as one step, when the buttons are live, and the two
// events that throw the history away (a new document and an opened one).

import { expect, test } from "../fixtures/editor-fixture";
import { twoBlockDiagram } from "../data/diagrams";

test.describe("undo and redo", () => {
  test("undo removes a freshly added block, redo restores it", async ({ editor }) => {
    await editor.addComponent("Module");
    await expect(editor.action("Undo")).toBeEnabled();

    await editor.action("Undo").click();
    await expect(editor.nodes).toHaveCount(0);

    await editor.action("Redo").click();
    await expect(editor.blockNode("Module 1")).toBeVisible();
  });

  test("redo is unavailable until something has been undone", async ({ editor }) => {
    await editor.addComponent("Module");
    await expect(editor.action("Redo")).toBeDisabled();

    await editor.action("Undo").click();
    await expect(editor.action("Redo")).toBeEnabled();
  });

  test("undo stops at the start of the document", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.action("Undo").click();

    await expect(editor.action("Undo")).toBeDisabled();
    await expect(editor.nodes).toHaveCount(0);
  });

  test("a fresh edit drops the redo stack", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.action("Undo").click();
    await expect(editor.action("Redo")).toBeEnabled();

    await editor.addComponent("Register");

    await expect(editor.action("Redo")).toBeDisabled();
    await expect(editor.blockNode("Register 1")).toBeVisible();
    await expect(editor.blockNode("Module 1")).toHaveCount(0);
  });

  test("steps unwind in order", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);
    await editor.placeComponentAt("Register", { x: 500, y: 150 });
    await editor.placeComponentAt("Constant", { x: 500, y: 400 });
    await expect(editor.nodes).toHaveCount(3);

    await editor.action("Undo").click();
    await expect(editor.blockNode("Constant 1")).toHaveCount(0);
    await expect(editor.blockNode("Register 1")).toBeVisible();

    await editor.action("Undo").click();
    await expect(editor.blockNode("Register 1")).toHaveCount(0);
    await expect(editor.blockNode("Module 1")).toBeVisible();
  });

  test("a rename is one step, not one per keystroke", async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.selectBlock("ALU Core");
    await editor.blockNameInput.fill("Adder");
    await editor.blockNameInput.press("Enter");
    await expect(editor.blockNode("Adder")).toBeVisible();

    await editor.action("Undo").click();

    await expect(editor.blockNode("ALU Core")).toBeVisible();
    await expect(editor.action("Undo")).toBeDisabled();
  });

  test("a drag is one step", async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.zoomOutTo(1);
    await editor.dragBlockBy("ALU Core", { dx: 0, dy: 160 });
    const moved = await editor.persistedDiagram();
    expect(moved.blocks[0].y).toBeGreaterThan(0);

    await editor.action("Undo").click();

    const restored = await editor.persistedDiagram();
    expect(restored.blocks[0]).toMatchObject({ x: 0, y: 0 });
  });

  // KNOWN DEFECT: deleting a wired block is recorded as two history steps, not
  // one. React Flow reports the removed edges and the removed node in separate
  // change batches, and deleteWires/deleteBlocks each commit; the first undo
  // therefore restores the block without its wire — a state the user never
  // created. A second undo brings the wire back.
  test.fail("undo brings back a deleted block and its wires", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.selectBlock("ALU Core");
    await page.keyboard.press("Delete");
    await expect(editor.nodes).toHaveCount(1);

    await editor.action("Undo").click();

    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.edges).toHaveCount(1);
  });

  test("a new document starts with an empty history", async ({ editor, page }) => {
    await editor.addComponent("Module");
    page.once("dialog", (dialog) => void dialog.accept());
    await editor.openMenu("File");
    await editor.action("New").click();

    await expect(editor.nodes).toHaveCount(0);
    await expect(editor.action("Undo")).toBeDisabled();
    await expect(editor.action("Redo")).toBeDisabled();
  });

  test("opening a document starts with an empty history", async ({ editor, page, workspace }) => {
    await editor.addComponent("Module");
    // Discarding the unsaved block must not leave it undoable back into the
    // document that replaces it.
    page.once("dialog", (dialog) => void dialog.accept());
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));

    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.action("Undo")).toBeDisabled();
    await expect(editor.dirtyIndicator).toHaveCount(0);
  });
});
