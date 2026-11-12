import { test, expect, type Page } from "@playwright/test";
import { effectsPanel, gotoStudio } from "./helpers.js";
/**
 * The Effects Library as the preset picker (Requirement 19, task 10.5): the behaviour the generated
 * screen does not provide on its own and the host adds. Role, label, and text locators only.
 */
const openButton = (page: Page) => effectsPanel(page).getByRole("button", { name: "Add effect" });
const library = (page: Page) => page.getByRole("dialog", { name: "Effects library" });
const cards = (page: Page) => library(page).getByRole("listbox", { name: "Effects" }).getByRole("option");
// The generated editor has no list for a layer's effects; each effect has exactly one "Split by" select.
const effectRows = (page: Page) => effectsPanel(page).getByRole("combobox", { name: "Split by" });
async function open(page: Page): Promise<void> {
  await gotoStudio(page, false);
  await openButton(page).click();
  await expect(library(page)).toBeVisible();
}
test("opening moves focus to the search box; Escape closes and returns focus to the opener", async ({ page }) => {
  await open(page);
  await expect(library(page).getByRole("searchbox", { name: "Search effects" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(library(page)).toBeHidden();
  await expect(openButton(page)).toBeFocused();
});
test("Tab stays inside the dialog", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), `Tab #${i + 1}`).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), `Shift+Tab #${i + 1}`).toBe(true);
  }
});
test("search and category filters narrow the cards; an empty result says so", async ({ page }) => {
  await open(page);
  await expect(cards(page)).toHaveCount(12);
  await library(page).getByRole("searchbox", { name: "Search effects" }).fill("wave");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAccessibleName(/^Wave,/);
  await library(page).getByRole("searchbox", { name: "Search effects" }).fill("");
  await library(page).getByRole("group", { name: "Category" }).getByRole("button", { name: "Looping" }).click();
  await expect(cards(page)).toHaveCount(2);
  await library(page).getByRole("searchbox", { name: "Search effects" }).fill("zzzz");
  await expect(library(page).getByText(/No effects match/)).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});
test("applying adds the effect with the staged split, as one undo step", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  await cards(page).filter({ hasText: "Blur In" }).click();
  await library(page).getByRole("radiogroup", { name: "Split by" }).getByRole("radio", { name: "Word" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await expect(library(page).getByText(/Applied Blur In/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(effectRows(page)).toHaveCount(before + 1);
  await expect(effectRows(page).last()).toHaveValue("word");
  // One Ctrl/Cmd+Z removes it again (one gesture, one undo step).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(effectRows(page)).toHaveCount(before);
});
test("the toast's Undo removes the effect it just added", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  await cards(page).filter({ hasText: "Wave" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await library(page).getByRole("button", { name: "Undo" }).click();
  await page.keyboard.press("Escape");
  await expect(effectRows(page)).toHaveCount(before);
});
test("Ctrl/Cmd+Z does nothing while the library is open", async ({ page }) => {
  await gotoStudio(page, false);
  const before = await effectRows(page).count();
  await openButton(page).click();
  await cards(page).filter({ hasText: "Wave" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await library(page).getByRole("option", { name: /^Wave,/ }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Escape");
  await expect(effectRows(page)).toHaveCount(before + 1);
});
test("applying an effect the layer already has updates it instead of adding a second", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  for (const split of ["Word", "Line"]) {
    await cards(page).filter({ hasText: "Wave" }).click();
    await library(page).getByRole("radiogroup", { name: "Split by" }).getByRole("radio", { name: split }).click();
    await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  }
  await page.keyboard.press("Escape");
  await expect(effectRows(page)).toHaveCount(before + 1);
  await expect(effectRows(page).last()).toHaveValue("line");
});
