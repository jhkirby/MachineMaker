/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

// Codecs (encoder/decoder) and multiplexers: blocks whose ports follow from
// their settings rather than being added by hand. Covers the defaults, how
// Size / Type / Data Size reshape the ports, that renames survive, and that
// a setting which would break a wire is locked until the wire is gone.

import { expect, test } from "../fixtures/editor-fixture";
import type { EditorPage } from "../helpers/editor-page";
import type { RtlBlock } from "../../src/shared/diagram-model";

/**
 * Save and read back the one block with the given label.
 *
 * @param editor - The editor page object.
 * @param label - The block's displayed name.
 * @returns The persisted block.
 * @throws {Error} If no block has that label.
 */
async function persistedBlock(editor: EditorPage, label: string): Promise<RtlBlock> {
  const diagram = await editor.persistedDiagram();
  const block = diagram.blocks.find((b) => b.label === label);
  if (!block) {
    throw new Error(`No block "${label}" in the saved diagram.`);
  }
  return block;
}

/**
 * Count a block's ports by direction.
 *
 * @param block - The block.
 * @returns How many inputs and outputs it has.
 */
function directionCounts(block: RtlBlock): { in: number; out: number } {
  return {
    in: block.ports.filter((p) => p.direction === "in").length,
    out: block.ports.filter((p) => p.direction === "out").length,
  };
}

/**
 * Put a Codec and an I/O Port on the canvas, side by side, and wire the
 * port's pin into one of the codec's inputs.
 *
 * @param editor - The editor page object.
 * @param input - Which codec input to wire.
 * @returns Nothing.
 */
async function wiredCodec(editor: EditorPage, input = "a0"): Promise<void> {
  await editor.addComponent("Codec");
  await editor.zoomOutTo(1);
  await editor.placeComponentAt("I/O Port", { x: 500, y: 150 });
  await editor.connect({ block: "Port 1", port: "pin" }, { block: "Codec 1", port: input });
  await expect(editor.edges).toHaveCount(1);
}

test.describe("codec", () => {
  test("starts as a 2-to-4 decoder of 1-bit ports", async ({ editor }) => {
    await editor.addComponent("Codec");
    const block = await persistedBlock(editor, "Codec 1");
    expect(block).toMatchObject({ kind: "codec", codecType: "decoder", bits: 2 });
    expect(directionCounts(block)).toEqual({ in: 2, out: 4 });
    expect(block.ports.every((p) => (p.width ?? 1) === 1)).toBe(true);
  });

  test("size sets the input count and 2^size outputs", async ({ editor, page }) => {
    await editor.addComponent("Codec");
    await editor.selectBlock("Codec 1");
    await page.getByRole("button", { name: "Increase size" }).click();
    await expect(editor.inspector).toContainText("3-to-8 decoder");

    const block = await persistedBlock(editor, "Codec 1");
    expect(directionCounts(block)).toEqual({ in: 3, out: 8 });
  });

  test("switching to encoder flips the ratio", async ({ editor, page }) => {
    await editor.addComponent("Codec");
    await editor.selectBlock("Codec 1");
    await page.getByRole("button", { name: "Encoder", exact: true }).click();
    await expect(editor.inspector).toContainText("4-to-2 encoder");

    const block = await persistedBlock(editor, "Codec 1");
    expect(block.codecType).toBe("encoder");
    expect(directionCounts(block)).toEqual({ in: 4, out: 2 });
  });

  test("offers no + Port and no per-port remove", async ({ editor }) => {
    await editor.addComponent("Codec");
    await editor.selectBlock("Codec 1");
    await expect(editor.inspector.getByRole("button", { name: "+ Port" })).toHaveCount(0);
    await expect(editor.inspector.locator(".port-row__remove")).toHaveCount(0);
  });

  test("locks its type while a wire is attached", async ({ editor, page }) => {
    await wiredCodec(editor);
    await editor.selectBlock("Codec 1");
    await expect(page.getByRole("button", { name: "Encoder", exact: true })).toBeDisabled();
    await expect(editor.inspector).toContainText("Disconnect its wires");
  });

  test("shrinks freely while only unwired ports would go", async ({ editor, page }) => {
    // a0 is wired; going from 2 to 1 bits drops only a1, y2 and y3.
    await wiredCodec(editor, "a0");
    await editor.selectBlock("Codec 1");
    await page.getByRole("button", { name: "Decrease size" }).click();
    await expect(editor.inspector).toContainText("1-to-2 decoder");
    await expect(editor.edges).toHaveCount(1);
  });

  test("won't shrink past a wired port", async ({ editor, page }) => {
    // a1 is wired, and it's the input a 2 → 1 shrink would remove.
    await wiredCodec(editor, "a1");
    await editor.selectBlock("Codec 1");
    await expect(page.getByRole("button", { name: "Decrease size" })).toBeDisabled();
    await expect(editor.inspector).toContainText("2-to-4 decoder");
  });

  test("keeps a renamed port's name through a size change", async ({ editor, page }) => {
    await editor.addComponent("Codec");
    await editor.selectBlock("Codec 1");
    const name = (await editor.portRow("a0")).locator("input").first();
    await name.fill("en");
    await name.press("Enter");
    await page.getByRole("button", { name: "Increase size" }).click();

    const block = await persistedBlock(editor, "Codec 1");
    expect(block.ports.map((p) => p.name)).toContain("en");
    expect(directionCounts(block)).toEqual({ in: 3, out: 8 });
  });
});

test.describe("multiplexer", () => {
  test("starts as a 2:1 mux with one select line", async ({ editor }) => {
    await editor.addComponent("Multiplexer");
    const block = await persistedBlock(editor, "Mux 1");
    expect(block).toMatchObject({ kind: "mux", bits: 1, dataWidth: 1 });
    expect(block.ports.filter((p) => p.role === "select")).toHaveLength(1);
    expect(directionCounts(block)).toEqual({ in: 3, out: 1 });
  });

  test("size sets the select lines and 2^size data inputs", async ({ editor, page }) => {
    await editor.addComponent("Multiplexer");
    await editor.selectBlock("Mux 1");
    await page.getByRole("button", { name: "Increase size" }).click();
    await page.getByRole("button", { name: "Increase size" }).click();
    await expect(editor.inspector).toContainText("8:1 mux");

    const block = await persistedBlock(editor, "Mux 1");
    expect(block.ports.filter((p) => p.role === "select")).toHaveLength(3);
    expect(directionCounts(block)).toEqual({ in: 8 + 3, out: 1 });
  });

  test("data size widens every data port but not the selects", async ({ editor, page }) => {
    await editor.addComponent("Multiplexer");
    await editor.selectBlock("Mux 1");
    const field = page.getByLabel("Data bus width in bits");
    await field.fill("16");
    await field.press("Enter");

    const block = await persistedBlock(editor, "Mux 1");
    expect(block.dataWidth).toBe(16);
    for (const port of block.ports) {
      expect(port.width ?? 1).toBe(port.role === "select" ? 1 : 16);
    }
  });

  test("its output can be renamed", async ({ editor }) => {
    await editor.addComponent("Multiplexer");
    await editor.selectBlock("Mux 1");
    const name = (await editor.portRow("y")).locator("input").first();
    await name.fill("out");
    await name.press("Enter");

    const block = await persistedBlock(editor, "Mux 1");
    expect(block.ports.find((p) => p.direction === "out")?.name).toBe("out");
  });
});
