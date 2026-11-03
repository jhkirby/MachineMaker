/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Working with blocks already on the canvas: selecting them, renaming and
// resizing through the inspector, moving them around, and deleting them.

import { expect, test } from "../fixtures/editor-fixture";
import { GRID, twoBlockDiagram } from "../data/diagrams";

test.describe("block editing", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    // A saved document gives two named blocks at known coordinates, which the
    // placement gestures cannot: they depend on the live pan and zoom.
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await expect(editor.nodes).toHaveCount(2);
  });

  test("clicking a block selects it and shows its properties", async ({ editor }) => {
    await expect(editor.inspector).not.toBeVisible();

    await editor.selectBlock("ALU Core");

    await expect(editor.blockNode("ALU Core")).toHaveClass(/selected/);
    await expect(editor.inspector).toBeVisible();
    await expect(editor.blockNameInput).toHaveValue("ALU Core");
    await expect(editor.documentStat).toHaveCount(0);
  });

  test("clicking empty canvas clears the selection", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await expect(editor.blockNameInput).toBeVisible();

    await editor.clickEmptyCanvas();
    // No single selection left to show properties for, so the inspector
    // slides fully shut rather than falling back to the document view.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("selecting another block replaces the selection", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.selectBlock("Pipe Reg");

    await expect(editor.blockNameInput).toHaveValue("Pipe Reg");
    await expect(editor.blockNode("ALU Core")).not.toHaveClass(/selected/);
  });

  // KNOWN DEFECT: DiagramCanvas documents Ctrl/Cmd-click as "adds or removes it
  // from the current selection", but React Flow's own click handling writes a
  // single-node selection back over the store's additive one, so the modifier
  // is ignored and the click behaves like a plain one. Verified with Control
  // physically held down across the click, not just flagged on the event.
  test.fail("ctrl-click extends the selection", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.selectBlock("Pipe Reg", { additive: true });

    await expect(editor.blockNode("ALU Core")).toHaveClass(/selected/);
    await expect(editor.blockNode("Pipe Reg")).toHaveClass(/selected/);
  });

  test("rubber-band selects every block it sweeps", async ({ editor }) => {
    await editor.zoomOutTo(0.8);
    await editor.boxSelect("ALU Core", "Pipe Reg");

    await expect(editor.blockNode("ALU Core")).toHaveClass(/selected/);
    await expect(editor.blockNode("Pipe Reg")).toHaveClass(/selected/);
    // With more than one block selected there is no single set of properties
    // to show, so the inspector falls back to the document view.
    await expect(editor.documentStat).toBeVisible();
  });

  test("delete clears a whole rubber-band selection", async ({ editor, page }) => {
    await editor.zoomOutTo(0.8);
    await editor.boxSelect("ALU Core", "Pipe Reg");
    await page.keyboard.press("Delete");

    await expect(editor.nodes).toHaveCount(0);
    await expect(editor.edges).toHaveCount(0);
    // Deleting the whole selection leaves nothing selected, so the inspector
    // slides shut along with it.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("renaming a block updates the canvas and the document", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.blockNameInput.fill("Adder");
    await editor.blockNameInput.press("Enter");

    await expect(editor.blockNode("Adder")).toBeVisible();
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks.map((block) => block.label)).toContain("Adder");
  });

  test("a duplicate name is refused", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.blockNameInput.fill("Pipe Reg");
    await expect(editor.blockNameInput).toHaveClass(/is-invalid/);

    await editor.blockNameInput.press("Enter");
    // The rejected draft snaps back rather than being committed.
    await expect(editor.blockNameInput).toHaveValue("ALU Core");
    await expect(editor.blockNode("ALU Core")).toBeVisible();
  });

  test("a name must start with a letter", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.blockNameInput.fill("9lives");

    // The keystroke never registers, so the field keeps its old value.
    await expect(editor.blockNameInput).toHaveValue("ALU Core");
  });

  // KNOWN DEFECT: Escape is meant to abandon the edit (NameInput restores the
  // last committed value), but the same handler then blurs the field, and the
  // blur handler still sees the pre-Escape draft in its closure and commits it.
  // The rename lands in the document — the opposite of what Escape promises.
  // CommitInput and NumericField share the pattern.
  test.fail("escape abandons a rename", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.blockNameInput.fill("Scrapped");
    await editor.blockNameInput.press("Escape");

    await expect(editor.blockNameInput).toHaveValue("ALU Core");
    await expect(editor.blockNode("ALU Core")).toBeVisible();
  });

  test("resizing is measured in grid cells", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await expect(editor.widthInput).toHaveValue("12");
    await expect(editor.heightInput).toHaveValue("8");

    await editor.widthInput.fill("20");
    await editor.widthInput.press("Enter");
    await editor.heightInput.fill("12");
    await editor.heightInput.press("Enter");

    const diagram = await editor.persistedDiagram();
    const block = diagram.blocks.find((candidate) => candidate.label === "ALU Core");
    expect(block).toMatchObject({ width: 20 * GRID, height: 12 * GRID });
  });

  // KNOWN DEFECT: resizeBlock promises to "never shrink past what the block's
  // ports need to each keep their own grid point", but minBlockSize measures
  // that as the *count* of ports on a side rather than the deepest slot any of
  // them sits at. A stock Module's left ports occupy slots 2, 4 and 6, so
  // shrinking it strands the lower ones outside the block body.
  test.fail("a block never shrinks below what its ports need", async ({ editor }) => {
    await editor.selectBlock("ALU Core");
    await editor.heightInput.fill("1");
    await editor.heightInput.press("Enter");

    const diagram = await editor.persistedDiagram();
    const block = diagram.blocks.find((candidate) => candidate.label === "ALU Core");
    const deepestSlot = Math.max(...(block?.ports ?? []).map((port) => port.slot));
    // Every port sits `slot` cells in from the top edge and must stay inside.
    expect(block?.height).toBeGreaterThanOrEqual(deepestSlot * GRID);
  });

  test("dragging a block moves it and keeps it on the grid", async ({ editor }) => {
    await editor.zoomOutTo(1);
    const before = await editor.persistedDiagram();
    const start = before.blocks.find((block) => block.label === "ALU Core");

    await editor.dragBlockBy("ALU Core", { dx: 0, dy: 160 });

    const after = await editor.persistedDiagram();
    const moved = after.blocks.find((block) => block.label === "ALU Core");
    expect(moved?.y).toBeGreaterThan(start?.y ?? 0);
    expect((moved?.x ?? 0) % (GRID / 2)).toBe(0);
    expect((moved?.y ?? 0) % (GRID / 2)).toBe(0);
  });

  test("a block dropped on another snaps back", async ({ editor }) => {
    await editor.zoomOutTo(1);
    const before = await editor.persistedDiagram();
    const start = before.blocks.find((block) => block.label === "ALU Core");

    const source = await editor.blockNode("ALU Core").boundingBox();
    const destination = await editor.blockNode("Pipe Reg").boundingBox();
    if (!source || !destination) {
      throw new Error("Both blocks must be visible.");
    }
    await editor.dragBlockBy("ALU Core", {
      dx: destination.x - source.x,
      dy: destination.y - source.y,
    });

    const after = await editor.persistedDiagram();
    const settled = after.blocks.find((block) => block.label === "ALU Core");
    expect(settled).toMatchObject({ x: start?.x, y: start?.y });
  });

  test("delete removes the selected block and its wires", async ({ editor, page }) => {
    await editor.selectBlock("ALU Core");
    await page.keyboard.press("Delete");

    await expect(editor.blockNode("ALU Core")).toHaveCount(0);
    await expect(editor.edges).toHaveCount(0);
    await expect(editor.nodes).toHaveCount(1);
    // The deleted block was the selection, so the inspector closes with it.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("backspace deletes too", async ({ editor, page }) => {
    await editor.selectBlock("Pipe Reg");
    await page.keyboard.press("Backspace");

    await expect(editor.nodes).toHaveCount(1);
  });

  test("delete with nothing selected does nothing", async ({ editor, page }) => {
    await editor.clickEmptyCanvas();
    await page.keyboard.press("Delete");

    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.action("Undo")).toBeDisabled();
  });
});
