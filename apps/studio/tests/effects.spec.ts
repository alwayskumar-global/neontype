import { test, expect } from "@playwright/test";
import { presetCatalog } from "@studio/engine";
import { applyPreset, canvasHash, effectsPanel, gotoStudio, listPresetNames, seek } from "./helpers.js";
import { RANGES_BY_ID } from "../src/wiring/tables.js";
/**
 * Effects (Requirement 4): the picker offers exactly the engine's preset catalog,
 * applying a preset seeds the catalog defaults and the first supported granularity,
 * granularity and params are editable, an invalid param is rejected inline, and an
 * effect can be removed. The picker is reached through `listPresetNames` and
 * `applyPreset`, so this spec does not change when the picker's UI does.
 */
/**
 * The generated editor has no list for a layer's effects: each effect has exactly one "Split by" select, and its
 * params are sliders named "<label> <value>". A param is found by its label (from the same table the editor uses);
 * the last match is the most recently added effect's.
 */
const effectRows = (page: import("@playwright/test").Page) => effectsPanel(page).getByRole("combobox", { name: "Split by" });
const param = (page: import("@playwright/test").Page, effectId: string, key: string) =>
  effectsPanel(page).getByRole("slider", { name: new RegExp(`^${RANGES_BY_ID[effectId]![key]!.label}( |$)`) }).last();
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
  await expect(effectsPanel(page).getByText(entry.displayName, { exact: true }).last()).toBeVisible();
  await expect(added).toHaveValue(entry.supportedGranularities[0]);
  for (const [key, value] of Object.entries(entry.defaultParams)) {
    if (RANGES_BY_ID[entry.id]?.[key] === undefined) continue; // only slider params are shown
    await expect(param(page, entry.id, key), key).toHaveValue(String(value));
  }
});
test("granularity and params can be edited and the preview follows", async ({ page }) => {
  await gotoStudio(page, false);
  await applyPreset(page, "Typewriter");
  const row = effectRows(page).last();
  await seek(page, 1.5);
  const revealed = await canvasHash(page);
  await param(page, "typewriter", "delayPerCharacter").fill("1");
  await expect(param(page, "typewriter", "delayPerCharacter")).toHaveValue("1");
  await expect.poll(async () => (await canvasHash(page)) === revealed).toBe(false);
  await row.selectOption("word");
  await expect(row).toHaveValue("word");
});
// Requirement 4.5: a param edit that fails the effect's schema is rejected inline and never written.
test("a param edit that fails the effect schema is rejected inline (Requirement 4.5)", async ({ page }) => {
  await gotoStudio(page, false);
  await applyPreset(page, "Typewriter");
  const delay = param(page, "typewriter", "delayPerCharacter");
  const good = await delay.inputValue();
  await delay.fill("-1");
  await expect(effectsPanel(page).getByRole("alert")).toContainText(/delayPerCharacter/);
  await expect(delay).toHaveValue(good);
});
test("applying a preset changes the preview, and an effect can be removed", async ({ page }) => {
  await gotoStudio(page, false);
  await seek(page, 0.6);
  const before = await canvasHash(page);
  const rowsBefore = await effectRows(page).count();
  await applyPreset(page, "Wave");
  await expect(effectRows(page)).toHaveCount(rowsBefore + 1);
  await expect.poll(async () => (await canvasHash(page)) === before).toBe(false);
  await effectsPanel(page).getByRole("button", { name: /^Remove / }).last().click();
  await expect(effectRows(page)).toHaveCount(rowsBefore);
});
