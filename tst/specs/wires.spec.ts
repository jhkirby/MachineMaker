/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Drawing wires between ports, the connections the editor must refuse, and the
// wire properties the inspector exposes once one is selected.

import { expect, test } from "../fixtures/editor-fixture";
import { twoBlockDiagram } from "../data/diagrams";

test.describe("wires", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.edges).toHaveCount(1);
  });

  test("dragging port to port draws a wire", async ({ editor }) => {
    await editor.connect(
      { block: "Pipe Reg", port: "q" },
      { block: "ALU Core", port: "a" },
    );

    await expect(editor.edges).toHaveCount(2);
    const diagram = await editor.persistedDiagram();
    const added = diagram.wires.find((wire) => wire.sourcePortId === "p-q");
    expect(added).toMatchObject({
      sourceBlockId: "blk-reg",
      targetBlockId: "blk-alu",
      targetPortId: "p-a",
    });
  });

  test("a wire off a bus port is drawn as a bus", async ({ editor }) => {
    // Pipe Reg's "q" is 32 bits wide, so the new wire inherits the range.
    await editor.connect(
      { block: "Pipe Reg", port: "q" },
      { block: "ALU Core", port: "a" },
    );

    const diagram = await editor.persistedDiagram();
    const added = diagram.wires.find((wire) => wire.sourcePortId === "p-q");
    expect(added).toMatchObject({ label: "[31:0]" });
    await expect(editor.canvas).toContainText("[31:0]");
  });

  test("ports of different widths cannot be wired together", async ({ editor }) => {
    // Pipe Reg's "q" is 32 bits wide; ALU Core's "clk" is a plain 1-bit port.
    await editor.connect(
      { block: "Pipe Reg", port: "q" },
      { block: "ALU Core", port: "clk" },
    );

    await expect(editor.edges).toHaveCount(1);
    expect((await editor.persistedDiagram()).wires).toHaveLength(1);
  });

  test("the same connection cannot be made twice", async ({ editor }) => {
    await editor.connect(
      { block: "ALU Core", port: "y" },
      { block: "Pipe Reg", port: "d" },
    );

    await expect(editor.edges).toHaveCount(1);
    expect((await editor.persistedDiagram()).wires).toHaveLength(1);
  });

  test("a port cannot be wired to itself", async ({ editor }) => {
    await editor.connect(
      { block: "ALU Core", port: "y" },
      { block: "ALU Core", port: "y" },
    );

    await expect(editor.edges).toHaveCount(1);
  });

  test("an output cannot be wired to another output", async ({ editor }) => {
    await editor.connect(
      { block: "ALU Core", port: "y" },
      { block: "Pipe Reg", port: "q" },
    );

    await expect(editor.edges).toHaveCount(1);
  });

  test("selecting a wire shows both endpoints", async ({ editor }) => {
    await editor.selectWire();

    await expect(editor.wireEndpoints).toHaveText("ALU Core.y → Pipe Reg.d");
    await expect(editor.documentStat).toHaveCount(0);
  });

  test("a wire label can be edited", async ({ editor }) => {
    await editor.selectWire();
    const label = editor.inspector.locator('input[type="text"]');
    await label.fill("data_bus");
    await label.press("Enter");

    await expect(editor.canvas).toContainText("data_bus");
    expect((await editor.persistedDiagram()).wires[0].label).toBe("data_bus");
  });

  test("clearing the label removes it from the canvas", async ({ editor }) => {
    await editor.selectWire();
    const label = editor.inspector.locator('input[type="text"]');
    await label.fill("");
    await label.press("Enter");

    expect((await editor.persistedDiagram()).wires[0].label).toBeUndefined();
  });

  test("deleting a selected wire leaves its blocks alone", async ({ editor, page }) => {
    await editor.selectWire();
    await page.keyboard.press("Delete");

    await expect(editor.edges).toHaveCount(0);
    await expect(editor.nodes).toHaveCount(2);
    // The deleted wire was the selection, so the inspector closes with it.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("a wire follows its block when it moves", async ({ editor }) => {
    await editor.zoomOutTo(0.8);
    const before = await editor.edge("wire-y-d").boundingBox();

    await editor.dragBlockBy("Pipe Reg", { dx: 0, dy: 120 });

    await expect
      .poll(async () => (await editor.edge("wire-y-d").boundingBox())?.height)
      .not.toBe(before?.height);
  });
});
