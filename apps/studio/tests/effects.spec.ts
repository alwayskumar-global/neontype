import { test, expect } from "@playwright/test";
import { presetCatalog } from "@studio/engine";
import { applyPreset, canvasHash, effectsPanel, gotoStudio, listPresetNames } from "./helpers.js";
/**
 * Effects (Requirement 4): the picker offers exactly the engine's preset catalog,
 * applying a preset seeds the catalog defaults and the first supported granularity,
 * granularity and params are editable, an invalid param is rejected inline, and an
 * effect can be removed. The picker is reached through `listPresetNames` and
 * `applyPreset`, so this spec does not change when the picker's UI does.
 */
/** A param field of one effect row. A select label also holds its option texts, so match the start. */
const param = (row: import("@playwright/test").Locator, key: string) => row.getByLabel(new RegExp(`^${key}`)).first();
const effectRows = (page: import("@playwright/test").Page) => effectsPanel(page).getByRole("listitem");
test("the picker lists exactly the 12 catalog presets, by display name", async ({ page }) => {
  await gotoStudio(page, false);
  const names = await listPresetNames(page);
  expect(presetCatalog.length).toBe(12);
  expect(names).toEqual(presetCatalog.map((p) => p.displayName));
});
test("applying a preset seeds the catalog defaults and the first granularity", async ({ page }) => {
  await gotoStudio(page, false);
  const before = await effectRows(page).count();
  const entry = presetCatalog.find((p) => p.id === "typewriter")!;
  await applyPreset(page, entry.displayName);
  await expect(effectRows(page)).toHaveCount(before + 1);
  const added = effectRows(page).last();
  await expect(added.getByText(entry.displayName, { exact: true })).toBeVisible();
  await expect(added.getByLabel("Granularity")).toHaveValue(entry.supportedGranularities[0]);
  for (const [key, value] of Object.entries(entry.defaultParams)) {
    await expect(param(added, key), key).toHaveValue(String(value));
  }
});
test("granularity and params can be edited and the preview follows", async ({ page }) => {
  await gotoStudio(page, false);
  await applyPreset(page, "Typewriter");
  const row = effectRows(page).last();
  await page.getByLabel("Scrub").fill("1.5");
  const revealed = await canvasHash(page);
  await param(row, "delayPerCharacter").fill("3");
  await expect(param(row, "delayPerCharacter")).toHaveValue("3");
  await expect.poll(async () => (await canvasHash(page)) === revealed).toBe(false);
  await row.getByLabel("Granularity").selectOption("word");
  await expect(row.getByLabel("Granularity")).toHaveValue("word");
  await param(row, "direction").selectOption("backward");
  await expect(param(row, "direction")).toHaveValue("backward");
});
// Requirement 4.5: a param edit that fails the effect's schema is rejected inline and never written.
test("a param edit that fails the effect schema is rejected inline (Requirement 4.5)", async ({ page }) => {
  await gotoStudio(page, false);
  await applyPreset(page, "Typewriter");
  const row = effectRows(page).last();
  const delay = param(row, "delayPerCharacter");
  const good = await delay.inputValue();
  await delay.fill("-1");
  await expect(effectsPanel(page).getByRole("alert")).toContainText(/delayPerCharacter/);
  await expect(delay).toHaveValue(good);
});
test("applying a preset changes the preview, and an effect can be removed", async ({ page }) => {
  await gotoStudio(page, false);
  await page.getByLabel("Scrub").fill("0.6");
  const before = await canvasHash(page);
  const rowsBefore = await effectRows(page).count();
  await applyPreset(page, "Wave");
  await expect(effectRows(page)).toHaveCount(rowsBefore + 1);
  await expect.poll(async () => (await canvasHash(page)) === before).toBe(false);
  await effectRows(page).last().getByRole("button", { name: "Remove effect" }).click();
  await expect(effectRows(page)).toHaveCount(rowsBefore);
});
