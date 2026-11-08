import { gotoStudio } from "./helpers.js";
import { test, expect } from "@playwright/test";

/**
 * Editing end-to-end (Requirements 2, 3, 4): add a layer, edit its text, change
 * its effect, and confirm the preview canvas pixels change after each — proving
 * the panels drive the pure model and the preview updates live.
 */

async function canvasHash(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const c = document.querySelector("canvas.preview-canvas") as HTMLCanvasElement;
    return c.toDataURL();
  });
}

test("add layer, edit text, change effect updates the preview", async ({ page }) => {
  await gotoStudio(page, true);

  // Scrub to a time where effects have settled so content is visible.
  const scrub = page.getByLabel("Scrub");
  await scrub.fill("0.9");
  await page.waitForTimeout(80);
  const before = await canvasHash(page);

  // Add a layer.
  await page.getByRole("button", { name: "Add layer" }).click();
  // Select the new (second) layer, then edit its text.
  const layerButtons = page.locator(".layer .layer-select");
  await layerButtons.last().click();
  const textInput = page.locator(".layer-editor input[type='text']");
  await textInput.fill("Vанакkam");
  await page.waitForTimeout(80);
  const afterText = await canvasHash(page);
  expect(afterText, "preview changed after add+edit").not.toBe(before);

  // Change the selected layer's effect via the effect picker.
  await page.getByLabel("Add effect").selectOption("wave");
  await page.waitForTimeout(80);
  const afterEffect = await canvasHash(page);
  expect(afterEffect, "preview changed after effect add").not.toBe(afterText);
});
