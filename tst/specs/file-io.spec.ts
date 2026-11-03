/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Opening and saving `.rtlproj` documents: the round trip through disk, the
// unsaved-changes guard, and what the editor does with a file it cannot trust.

import { expect, test } from "../fixtures/editor-fixture";
import {
  MALFORMED_FILES,
  gridDiagram,
  hostileDiagram,
  twoBlockDiagram,
} from "../data/diagrams";

/** Schema version every saved document must carry. */
const SCHEMA_VERSION = 3;

test.describe("saving", () => {
  test("writes the whole document as JSON", async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    const target = workspace.path("saved.rtlproj");
    await editor.dialogs.stub({ save: target });

    await editor.page.keyboard.press("Control+Shift+S");

    const saved = await workspace.readDiagramWhenWritten(target);
    expect(saved).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      title: "Fetch Stage",
    });
    expect(saved.blocks).toHaveLength(2);
    expect(saved.wires).toHaveLength(1);
  });

  test("clears the unsaved-changes marker", async ({ editor, workspace }) => {
    await editor.addComponent("Module");
    await expect(editor.dirtyIndicator).toBeVisible();
    await editor.dialogs.stub({ save: workspace.path("saved.rtlproj") });

    await editor.openMenu("File");
    await editor.action("Save").click();

    await expect(editor.dirtyIndicator).toHaveCount(0);
  });

  test("cancelling leaves the document unsaved", async ({ editor, workspace }) => {
    await editor.addComponent("Module");
    await editor.dialogs.stub({ save: null });

    await editor.openMenu("File");
    await editor.action("Save").click();

    await expect(editor.dirtyIndicator).toBeVisible();
    expect(workspace.exists(workspace.path("saved.rtlproj"))).toBe(false);
  });

  test("saving again reuses the path without asking", async ({ editor, workspace }) => {
    const target = workspace.path("saved.rtlproj");
    await editor.addComponent("Module");
    await editor.dialogs.stub({ save: target });
    await editor.openMenu("File");
    await editor.action("Save").click();
    await workspace.readDiagramWhenWritten(target);
    await editor.dialogs.clearCalls();

    await editor.addComponent("Register");
    await editor.openMenu("File");
    await editor.action("Save").click();
    await expect(editor.dirtyIndicator).toHaveCount(0);

    expect(await editor.dialogs.calls()).toHaveLength(0);
    expect((await workspace.readDiagramWhenWritten(target)).blocks).toHaveLength(2);
  });

  test("save-as always asks, even with a path", async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
    const copy = workspace.path("copy.rtlproj");
    await editor.dialogs.stub({ save: copy });

    await editor.page.keyboard.press("Control+Shift+S");

    await workspace.readDiagramWhenWritten(copy);
    // The original is left exactly as it was on disk.
    expect(workspace.readText(workspace.path("two.rtlproj"))).toContain("Fetch Stage");
  });
});

test.describe("opening", () => {
  test("loads blocks, wires, and the title", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));

    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.edges).toHaveCount(1);
    await expect(editor.titleInput).toHaveValue("Fetch Stage");
    await expect(editor.dirtyIndicator).toHaveCount(0);
    await expect(page).toHaveTitle("Fetch Stage — MachineMaker");
  });

  test("renders a document at working volume", async ({ editor, workspace }) => {
    const diagram = gridDiagram();
    await editor.openDocument(workspace.writeDiagram("big.rtlproj", diagram));

    await expect(editor.nodes).toHaveCount(diagram.blocks.length);
    await expect(editor.edges).toHaveCount(diagram.wires.length);
  });

  test("cancelling changes nothing", async ({ editor }) => {
    await editor.addComponent("Module");
    await editor.dialogs.stub({ open: null });

    await editor.openMenu("File");
    await editor.action("Open").click();

    await expect(editor.blockNode("Module 1")).toBeVisible();
    await expect(editor.dirtyIndicator).toBeVisible();
  });

  test("a clean document opens without a prompt", async ({ editor, page, workspace }) => {
    let prompted = false;
    page.on("dialog", (dialog) => {
      prompted = true;
      void dialog.accept();
    });

    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));

    await expect(editor.nodes).toHaveCount(2);
    expect(prompted).toBe(false);
  });

  test("unsaved changes are guarded", async ({ editor, page, workspace }) => {
    await editor.addComponent("Module");
    let message = "";
    page.once("dialog", (dialog) => {
      message = dialog.message();
      void dialog.dismiss();
    });

    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));

    expect(message).toBe("Discard unsaved changes?");
    // Dismissing means "keep my work", so the open must not happen.
    await expect(editor.blockNode("Module 1")).toBeVisible();
    await expect(editor.nodes).toHaveCount(1);
  });

  test("accepting the guard replaces the document", async ({ editor, page, workspace }) => {
    await editor.addComponent("Module");
    page.once("dialog", (dialog) => void dialog.accept());

    await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));

    await expect(editor.nodes).toHaveCount(2);
    await expect(editor.blockNode("Module 1")).toHaveCount(0);
  });

  test("a new document is guarded the same way", async ({ editor, page }) => {
    await editor.addComponent("Module");
    page.once("dialog", (dialog) => void dialog.dismiss());

    await editor.openMenu("File");
    await editor.action("New").click();

    await expect(editor.blockNode("Module 1")).toBeVisible();
  });
});

test.describe("untrusted documents", () => {
  for (const [name, body] of Object.entries(MALFORMED_FILES)) {
    test(`rejects ${name} without losing the open document`, async ({
      editor,
      workspace,
    }) => {
      await editor.openDocument(workspace.writeDiagram("two.rtlproj", twoBlockDiagram()));
      await expect(editor.nodes).toHaveCount(2);

      await editor.openDocument(workspace.writeRaw(name, body));

      // The load fails in the main process; the editor must keep what it had
      // rather than half-applying the broken file.
      await expect(editor.nodes).toHaveCount(2);
      await expect(editor.titleInput).toHaveValue("Fetch Stage");
      await expect(editor.dirtyIndicator).toHaveCount(0);
    });
  }

  test("stays usable after a failed open", async ({ editor, workspace }) => {
    await editor.openDocument(workspace.writeRaw("bad.rtlproj", MALFORMED_FILES["not-json.rtlproj"]));

    await editor.addComponent("Module");

    await expect(editor.blockNode("Module 1")).toBeVisible();
  });

  test("renders markup in a label as text, not HTML", async ({ editor, page, workspace }) => {
    await editor.openDocument(workspace.writeDiagram("hostile.rtlproj", hostileDiagram()));

    const label = hostileDiagram().blocks[0].label;
    await expect(editor.nodes).toHaveCount(1);
    await expect(editor.canvas).toContainText(label);
    // Nothing in the document may reach the DOM as an element or a script.
    expect(await page.locator(".react-flow img").count()).toBe(0);
    expect(await page.evaluate(() => (globalThis as Record<string, unknown>)["__pwned"])).toBeUndefined();
    expect(
      await page.evaluate(() => (globalThis as Record<string, unknown>)["__portPwned"]),
    ).toBeUndefined();
  });

  test("an out-of-range bus width from a file is shown as invalid", async ({
    editor,
    workspace,
  }) => {
    await editor.openDocument(workspace.writeDiagram("hostile.rtlproj", hostileDiagram()));
    await editor.selectBlock(hostileDiagram().blocks[0].label);

    const width = (await editor.portRow("wide")).getByLabel("Port bus width");
    await expect(width).toHaveValue("999999");
    await expect(width).toHaveClass(/is-invalid/);
  });
});
