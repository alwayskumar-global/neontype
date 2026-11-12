import { test, expect } from "@playwright/test";
import { gotoStudio, layerField, readReadout, seek } from "./helpers.js";
/**
 * Keyboard shortcuts the editor's tooltips promise: Space plays or pauses, Home goes to the first frame, End to
 * the last. They are ignored while focus is in a text field.
 */
const play = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Play" }).first();
const pause = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Pause" }).first();
test("Space plays and pauses", async ({ page }) => {
  await gotoStudio(page, true);
  await expect(play(page)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(pause(page)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(play(page)).toBeVisible();
});
test("Home goes to frame 0", async ({ page }) => {
  await gotoStudio(page, true);
  await seek(page, 2);
  expect((await readReadout(page)).frame).toBe(60);
  await page.keyboard.press("Home");
  expect(await readReadout(page)).toEqual({ frame: 0, total: 180, time: 0 });
});
test("End goes to the last frame and pauses", async ({ page }) => {
  await gotoStudio(page, true);
  await page.keyboard.press("Space");
  await expect(pause(page)).toBeVisible();
  await page.keyboard.press("End");
  await expect(play(page)).toBeVisible();
  const r = await readReadout(page);
  expect(r.frame).toBe(r.total - 1);
  expect(r.total).toBe(180);
});
test("the shortcuts do nothing while typing in the Text field", async ({ page }) => {
  await gotoStudio(page, true);
  await seek(page, 2);
  const before = await readReadout(page);
  const text = layerField(page, "Text");
  const value = await text.inputValue();
  await text.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await page.keyboard.type(" x");
  await expect(text).toHaveValue(" x" + value);
  await expect(play(page)).toBeVisible();
  expect(await readReadout(page)).toEqual(before);
});
test("a focused button keeps Space for itself", async ({ page }) => {
  await gotoStudio(page, false);
  const rows = page.getByRole("region", { name: "LAYERS" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await page.getByRole("region", { name: "LAYERS" }).getByRole("button", { name: "Add layer" }).focus();
  await page.keyboard.press("Space");
  await expect(rows).toHaveCount(2);
  await expect(play(page)).toBeVisible();
});
test("leaving the editor removes the listener: after going back and in again, one Space toggles once", async ({ page }) => {
  await gotoStudio(page, true);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Animated titles, made in your browser." })).toBeVisible();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Open the studio" }).first().click();
  await expect(play(page)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(pause(page)).toBeVisible();
  await page.waitForTimeout(200);
  await expect(pause(page)).toBeVisible();
});
