/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Tying a port off: marking it deliberately unused so a diagram can be
// complete without wiring it. Covers the inspector toggle, the X drawn on
// the canvas, which ports never offer it, and that a wire blocks it.

import { expect, test } from "../fixtures/editor-fixture";

test.describe("port tie-off", () => {
  test("ties a port off and marks it on the canvas", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.selectBlock("Module 1");
    const row = await editor.portRow("in");
    await row.getByRole("button", { name: "Tie off port" }).click();

    await expect(row.getByRole("button", { name: "Untie port" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(editor.blockNode("Module 1").locator(".rtl-port--tied")).toHaveCount(1);

    const diagram = await editor.persistedDiagram();
    const port = diagram.blocks[0].ports.find((p) => p.name === "in");
    expect(port?.tiedOff).toBe(true);
  });

  test("untying restores the port", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.selectBlock("Module 1");
    const row = await editor.portRow("in");
    await row.getByRole("button", { name: "Tie off port" }).click();
    await row.getByRole("button", { name: "Untie port" }).click();

    await expect(editor.blockNode("Module 1").locator(".rtl-port--tied")).toHaveCount(0);
  });

  test("clk and reset have no tie-off", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.selectBlock("Module 1");
    for (const name of ["clk", "reset"]) {
      const row = await editor.portRow(name);
      await expect(row.locator(".port-row__tie")).toHaveCount(0);
    }
  });

  test("I/O ports and constants have no tie-off column", async ({ editor }) => {
    await editor.addComponent("I/O Port");
    await editor.selectBlock("Port 1");
    await expect(editor.inspector.locator(".port-row__tie")).toHaveCount(0);
  });

  test("a wired port can't be tied off", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.zoomOutTo(1);
    await editor.placeComponentAt("I/O Port", { x: 500, y: 150 });
    await editor.connect({ block: "Port 1", port: "pin" }, { block: "Module 1", port: "in" });
    await expect(editor.edges).toHaveCount(1);

    await editor.selectBlock("Module 1");
    const row = await editor.portRow("in");
    await expect(row.getByRole("button", { name: "Tie off port" })).toBeDisabled();
  });
});
