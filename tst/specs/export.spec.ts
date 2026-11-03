/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Exporting the diagram as a picture: that a real SVG/PNG reaches disk, that
// cancelling writes nothing, and that neither the file name nor the markup can
// be steered by what a document happens to contain.

import { basename } from "node:path";
import { expect, test } from "../fixtures/editor-fixture";
import { hostileDiagram, twoBlockDiagram } from "../data/diagrams";

/** First bytes of every PNG file, per the format's signature. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe("export", () => {
  test.beforeEach(async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    await expect(editor.nodes).toHaveCount(2);
  });

  test("writes standalone SVG markup", async ({ editor, workspace }) => {
    const target = workspace.path("diagram.svg");
    await editor.dialogs.stub({ save: target });

    await editor.openMenu("Export");
    await editor.action("SVG").click();

    await workspace.waitForFile(target);
    const svg = workspace.readText(target);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("ALU Core");
    expect(svg).toContain("Pipe Reg");
  });

  test("writes a real PNG", async ({ editor, workspace }) => {
    const target = workspace.path("diagram.png");
    await editor.dialogs.stub({ save: target });

    await editor.openMenu("Export");
    await editor.action("PNG").click();

    await workspace.waitForFile(target);
    const bytes = workspace.readBytes(target);
    // The renderer hands over a data URL; the main process must decode it
    // rather than writing the base64 text.
    expect(bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test("cancelling writes nothing", async ({ editor, workspace }) => {
    await editor.dialogs.stub({ save: null });

    await editor.openMenu("Export");
    await editor.action("SVG").click();
    await editor.openMenu("Export");
    await editor.action("PNG").click();

    expect(workspace.exists(workspace.path("diagram.svg"))).toBe(false);
    expect(workspace.exists(workspace.path("diagram.png"))).toBe(false);
  });

  test("suggests the document title as the file name", async ({ editor, workspace }) => {
    await editor.dialogs.stub({ save: workspace.path("diagram.svg") });

    await editor.openMenu("Export");
    await editor.action("SVG").click();
    await workspace.waitForFile(workspace.path("diagram.svg"));

    const call = await editor.dialogs.lastCall();
    // Spaces are legal in a file name and are kept; only characters Windows
    // and POSIX both reject are stripped.
    expect(call?.options.defaultPath).toBe("Fetch Stage.svg");
  });

  test("an empty diagram still exports", async ({ editor, page, workspace }) => {
    page.once("dialog", (dialog) => void dialog.accept());
    await editor.openMenu("File");
    await editor.action("New").click();
    await expect(editor.nodes).toHaveCount(0);
    const target = workspace.path("empty.svg");
    await editor.dialogs.stub({ save: target });

    await editor.openMenu("Export");
    await editor.action("SVG").click();

    await workspace.waitForFile(target);
    expect(workspace.readText(target)).toContain("<svg");
  });
});

test.describe("export hardening", () => {
  test.beforeEach(async ({ editor, page, workspace }) => {
    page.once("dialog", (dialog) => void dialog.accept());
    await editor.openDocument(workspace.writeDiagram("hostile.rtlproj", hostileDiagram()));
    await expect(editor.nodes).toHaveCount(1);
  });

  test("a path-traversal title cannot escape the chosen folder", async ({
    editor,
    workspace,
  }) => {
    const target = workspace.path("hostile.svg");
    await editor.dialogs.stub({ save: target });

    await editor.openMenu("Export");
    await editor.action("SVG").click();
    await workspace.waitForFile(target);

    // The title is "../../../etc/passwd"; the suggested name must be a bare
    // file name, with no separators or parent-directory hops left in it.
    const suggested = await editor.dialogs.lastCall();
    const name = suggested?.options.defaultPath ?? "";
    expect(name).toBe(basename(name));
    expect(name).not.toContain("..");
    expect(name).not.toMatch(/[/\\]/);
  });

  test("markup in a label is escaped in the SVG", async ({ editor, workspace }) => {
    const target = workspace.path("hostile.svg");
    await editor.dialogs.stub({ save: target });

    await editor.openMenu("Export");
    await editor.action("SVG").click();
    await workspace.waitForFile(target);

    const svg = workspace.readText(target);
    // The label text survives, but only as escaped character data — an SVG
    // opened in a browser must not gain an element or a script from it.
    expect(svg).toContain("&lt;img src=x");
    expect(svg).not.toContain("<img");
    expect(svg).not.toContain("<script");
  });
});
