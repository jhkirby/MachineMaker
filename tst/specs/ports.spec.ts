/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// The port table in the inspector: adding, renaming, re-siding, re-typing,
// widening, and removing the connection points on a block — and the rules that
// keep a port name a legal identifier and a bus width in range.

import { expect, test } from "../fixtures/editor-fixture";
import { twoBlockDiagram } from "../data/diagrams";

/** Widest bus the model accepts, from src/shared/diagram-model.ts. */
const MAX_BUS_WIDTH = 1024;

test.describe("ports", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.selectBlock("ALU Core");
    await expect(editor.portRows).toHaveCount(3);
  });

  test("lists the selected block's ports", async ({ editor }) => {
    expect(await editor.portNames()).toEqual(["clk", "a", "y"]);
  });

  test("adds an input on the left", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "+ Input" }).click();

    expect(await editor.portNames()).toEqual(["clk", "a", "y", "in"]);
    const diagram = await editor.persistedDiagram();
    const added = diagram.blocks[0].ports.find((port) => port.name === "in");
    expect(added).toMatchObject({ side: "left", direction: "in" });
  });

  test("adds an output on the right", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "+ Output" }).click();

    const diagram = await editor.persistedDiagram();
    const added = diagram.blocks[0].ports.find((port) => port.name === "out");
    expect(added).toMatchObject({ side: "right", direction: "out" });
  });

  test("a new port lands on a free slot", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "+ Input" }).click();

    const diagram = await editor.persistedDiagram();
    const left = diagram.blocks[0].ports.filter((port) => port.side === "left");
    const slots = left.map((port) => port.slot);
    // No two ports on a side may share a grid point.
    expect(new Set(slots).size).toBe(slots.length);
  });

  test("the block grows to fit ports it cannot seat", async ({ editor }) => {
    const before = (await editor.persistedDiagram()).blocks[0].height;
    for (let index = 0; index < 8; index += 1) {
      await editor.inspector.getByRole("button", { name: "+ Input" }).click();
    }

    const after = (await editor.persistedDiagram()).blocks[0];
    expect(after.height).toBeGreaterThan(before);
    expect(after.ports.filter((port) => port.side === "left")).toHaveLength(10);
  });

  test("renaming a port updates the canvas", async ({ editor }) => {
    const row = await editor.portRow("clk");
    const name = row.getByLabel("Port name");
    await name.fill("clk_en");
    await name.press("Enter");

    await expect(editor.blockNode("ALU Core")).toContainText("clk_en");
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks[0].ports.map((port) => port.name)).toContain("clk_en");
  });

  test("a port name refuses digits and spaces", async ({ editor }) => {
    const name = (await editor.portRow("clk")).getByLabel("Port name");

    await name.fill("clk2");
    await expect(name).toHaveValue("clk");

    await name.fill("clk en");
    await expect(name).toHaveValue("clk");
  });

  test("a port name refuses a doubled separator", async ({ editor }) => {
    const name = (await editor.portRow("clk")).getByLabel("Port name");

    await name.fill("clk__en");
    await expect(name).toHaveValue("clk");
  });

  test("a duplicate port name is refused", async ({ editor }) => {
    const name = (await editor.portRow("clk")).getByLabel("Port name");
    await name.fill("a");
    await expect(name).toHaveClass(/is-invalid/);

    await name.press("Enter");
    await expect(name).toHaveValue("clk");
  });

  test("moving a port to another side re-seats it", async ({ editor }) => {
    // Not "clk": a module's clock is pinned to a fixed edge (see
    // normalizeFixedPorts) and its side selector is replaced with plain text.
    await (await editor.portRow("a")).locator("select").first().selectOption("bottom");

    const diagram = await editor.persistedDiagram();
    const moved = diagram.blocks[0].ports.find((port) => port.name === "a");
    expect(moved?.side).toBe("bottom");
    const bottomSlots = diagram.blocks[0].ports
      .filter((port) => port.side === "bottom")
      .map((port) => port.slot);
    expect(new Set(bottomSlots).size).toBe(bottomSlots.length);
  });

  test("flipping a port's direction changes its handle", async ({ editor }) => {
    const handle = await editor.portHandle("ALU Core", "clk");
    await expect(handle).toHaveClass(/rtl-port--in/);

    // clk's side selector is replaced with fixed text (see the "module
    // combinational/sequential mode" tests below), leaving direction as the
    // row's only <select>.
    await (await editor.portRow("clk")).locator("select").first().selectOption("out");

    await expect(await editor.portHandle("ALU Core", "clk")).toHaveClass(/rtl-port--out/);
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks[0].ports.find((port) => port.name === "clk")?.direction).toBe("out");
  });

  test("a bus width is annotated on the port", async ({ editor }) => {
    const width = (await editor.portRow("clk")).getByLabel("Port bus width");
    await width.fill("8");
    await width.press("Enter");

    await expect(editor.blockNode("ALU Core")).toContainText("[7:0]");
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks[0].ports.find((port) => port.name === "clk")?.width).toBe(8);
  });

  test("width 1 drops the annotation entirely", async ({ editor }) => {
    const width = (await editor.portRow("a")).getByLabel("Port bus width");
    await expect(width).toHaveValue("32");

    await width.fill("1");
    await width.press("Enter");

    const diagram = await editor.persistedDiagram();
    const port = diagram.blocks[0].ports.find((candidate) => candidate.name === "a");
    // A 1-bit wire carries no range label, so the field is dropped rather than
    // written as 1.
    expect(port?.width).toBeUndefined();
  });

  test("a width below the minimum is refused", async ({ editor }) => {
    const width = (await editor.portRow("a")).getByLabel("Port bus width");
    await width.fill("0");
    await expect(width).toHaveClass(/is-invalid/);

    await width.press("Enter");
    await expect(width).toHaveValue("32");
  });

  test("a width above the maximum is refused", async ({ editor }) => {
    const width = (await editor.portRow("a")).getByLabel("Port bus width");
    await width.fill(String(MAX_BUS_WIDTH + 1));
    await expect(width).toHaveClass(/is-invalid/);

    await width.press("Enter");
    await expect(width).toHaveValue("32");
  });

  test("a non-numeric width is refused", async ({ editor }) => {
    const width = (await editor.portRow("a")).getByLabel("Port bus width");
    await width.fill("-4");
    await expect(width).toHaveClass(/is-invalid/);

    await width.press("Enter");
    await expect(width).toHaveValue("32");
  });

  test("removing a port takes its wires with it", async ({ editor }) => {
    await expect(editor.edges).toHaveCount(1);

    await (await editor.portRow("y")).getByTitle("Remove port").click();

    await expect(editor.portRows).toHaveCount(2);
    await expect(editor.blockNode("ALU Core")).not.toContainText("y");
    const diagram = await editor.persistedDiagram();
    expect(diagram.wires).toHaveLength(0);
  });

  test("removing an unwired port leaves the wires alone", async ({ editor }) => {
    await (await editor.portRow("clk")).getByTitle("Remove port").click();

    await expect(editor.portRows).toHaveCount(2);
    await expect(editor.edges).toHaveCount(1);
  });
});

test.describe("module combinational/sequential mode", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await editor.selectBlock("ALU Core");
  });

  test("the clock renders as a triangle, not a plain port", async ({ editor }) => {
    await expect(await editor.portHandle("ALU Core", "clk")).toHaveClass(/rtl-port--clock/);
  });

  test("switching to combinational removes the clock", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "Combinational" }).click();

    expect(await editor.portNames()).not.toContain("clk");
    const diagram = await editor.persistedDiagram();
    expect(diagram.blocks[0].ports.some((port) => port.name === "clk")).toBe(false);
  });

  test("switching back to sequential restores a clock and a reset", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "Combinational" }).click();
    await editor.inspector.getByRole("button", { name: "Sequential" }).click();

    const names = await editor.portNames();
    expect(names).toContain("clk");
    expect(names).toContain("reset");
  });

  test("a restored reset is a single plain port, not a bubble pair", async ({ editor }) => {
    await editor.inspector.getByRole("button", { name: "Combinational" }).click();
    await editor.inspector.getByRole("button", { name: "Sequential" }).click();

    await expect(editor.blockNode("ALU Core").locator(".rtl-port__bubble")).toHaveCount(0);
    await expect(await editor.portHandle("ALU Core", "reset")).toBeVisible();
  });

  test("the clock stays bottom-most on the left when another left port is added", async ({
    editor,
  }) => {
    await editor.inspector.getByRole("button", { name: "+ Input" }).click();

    const diagram = await editor.persistedDiagram();
    const left = diagram.blocks[0].ports.filter((port) => port.side === "left");
    const clk = left.find((port) => port.name === "clk");
    expect(clk?.slot).toBe(Math.max(...left.map((port) => port.slot)));
  });

  test("the clock's side selector is fixed, not editable", async ({ editor }) => {
    const row = await editor.portRow("clk");
    await expect(row.locator("select")).toHaveCount(1); // direction only
    await expect(row).toContainText("left");
  });
});
