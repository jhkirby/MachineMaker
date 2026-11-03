/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// The state a user should find on launch: one window, the three-pane shell, an
// empty untitled document, and no action offered that cannot yet do anything.

import { expect, test } from "../fixtures/editor-fixture";

test.describe("application shell", () => {
  test("opens a single window", async ({ app }) => {
    expect(app.windows()).toHaveLength(1);
  });

  test("lays out toolbar, palette, canvas — inspector stays closed with nothing selected", async ({
    editor,
  }) => {
    await expect(editor.toolbar).toBeVisible();
    await expect(editor.palette).toBeVisible();
    await expect(editor.canvas).toBeVisible();
    // The inspector only slides into view once a block or wire is selected
    // (see InspectorPanel.tsx); on a fresh, selection-less document it stays
    // off-screen so the canvas gets the full width.
    await expect(editor.inspector).not.toBeVisible();
  });

  test("starts on an empty untitled document", async ({ editor, page }) => {
    await expect(editor.titleInput).toHaveValue("Untitled Schematic");
    await expect(editor.nodes).toHaveCount(0);
    await expect(editor.edges).toHaveCount(0);
    await expect(page).toHaveTitle("Untitled Schematic — MachineMaker");
  });

  test("starts clean, with nothing to undo", async ({ editor }) => {
    await expect(editor.dirtyIndicator).toHaveCount(0);
    await expect(editor.action("Undo")).toBeDisabled();
    await expect(editor.action("Redo")).toBeDisabled();
  });

  test("shows the canvas furniture", async ({ editor }) => {
    await expect(editor.controls).toBeVisible();
    await expect(editor.miniMap).toBeVisible();
    await expect(editor.gridBackground).toBeVisible();
  });

  test("window title tracks the document", async ({ editor, page }) => {
    await editor.titleInput.fill("Fetch Stage");
    await editor.titleInput.press("Enter");
    await expect(page).toHaveTitle("● Fetch Stage — MachineMaker");
    await expect(editor.dirtyIndicator).toBeVisible();
  });
});
