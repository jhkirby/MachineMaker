import { test } from "../fixtures/editor-fixture";

test("visual check: shrinking width/height never overlaps or escapes", async ({
  editor,
  page,
}) => {
  await editor.addComponent("Module");
  await editor.selectBlock("Module 1");

  await editor.widthInput.fill("2");
  await editor.heightInput.fill("2");
  await page.waitForTimeout(300);

  console.log("width field:", await editor.widthInput.inputValue());
  console.log("height field:", await editor.heightInput.inputValue());
  const diagram = await editor.persistedDiagram();
  console.log("block size:", diagram.blocks[0].width, diagram.blocks[0].height);
  console.log("ports:", JSON.stringify(diagram.blocks[0].ports));

  await page.screenshot({ path: "tst/.artifacts/_visual-check.png" });
});
