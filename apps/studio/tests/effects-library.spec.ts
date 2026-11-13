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
test("applying adds the effect with the staged split, closes the dialog, and focuses Add effect, as one undo step", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  await cards(page).filter({ hasText: "Blur In" }).click();
  await library(page).getByRole("radiogroup", { name: "Split by" }).getByRole("radio", { name: "Word" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await expect(library(page)).toBeHidden();
  await expect(openButton(page)).toBeFocused();
  await expect(effectRows(page)).toHaveCount(before + 1);
  await expect(effectRows(page).last()).toHaveValue("word");
  await expect(effectRows(page).last()).toBeInViewport();
  await expect(page.getByRole("status").filter({ hasText: /Applied Blur In/ })).toBeAttached();
  // One Ctrl/Cmd+Z removes it again (one gesture, one undo step).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(effectRows(page)).toHaveCount(before);
});
test("a new effect is scrolled into view in Effects on this layer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await gotoStudio(page, false);
  for (const name of ["Wave", "Spotlight", "Glitch Reveal"]) {
    await openButton(page).click();
    await cards(page).filter({ hasText: name }).click();
    await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
    await expect(library(page)).toBeHidden();
    await expect(effectRows(page).last()).toBeInViewport();
  }
});
test("after an apply, Ctrl/Cmd+Z undoes it from the editor", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  await cards(page).filter({ hasText: "Wave" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await expect(library(page)).toBeHidden();
  await expect(effectRows(page)).toHaveCount(before + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(effectRows(page)).toHaveCount(before);
});
test("Ctrl/Cmd+Z does nothing while the library is open", async ({ page }) => {
  await gotoStudio(page, false);
  const before = await effectRows(page).count();
  await openButton(page).click();
  await cards(page).filter({ hasText: "Wave" }).click();
  await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
  await expect(library(page)).toBeHidden();
  await openButton(page).click();
  await library(page).getByRole("option", { name: /^Wave,/ }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Escape");
  await expect(effectRows(page)).toHaveCount(before + 1);
});
test("applying an effect the layer already has updates it instead of adding a second", async ({ page }) => {
  await open(page);
  const before = await effectRows(page).count();
  for (const split of ["Word", "Line"]) {
    if (!(await library(page).isVisible())) await openButton(page).click();
    await cards(page).filter({ hasText: "Wave" }).click();
    await library(page).getByRole("radiogroup", { name: "Split by" }).getByRole("radio", { name: split }).click();
    await library(page).getByRole("button", { name: "Apply to selected layer" }).click();
    await expect(library(page)).toBeHidden();
  }
  await expect(effectRows(page)).toHaveCount(before + 1);
  await expect(effectRows(page).last()).toHaveValue("line");
});
/** Samples the opacity and transform of the first letter of a card's preview a few times, 300 ms apart. */
async function sampleThumb(page: Page, effectName: string): Promise<string[]> {
  const letter = cards(page).filter({ hasText: effectName }).locator('[aria-hidden="true"] > span').first();
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    out.push(await letter.evaluate((el) => `${getComputedStyle(el).opacity}|${getComputedStyle(el).transform}|${getComputedStyle(el).animationName}`));
    await page.waitForTimeout(300);
  }
  return out;
}
test("a card's preview plays in a loop with no hover or focus", async ({ page }) => {
  await open(page);
  await page.mouse.move(2, 2);
  for (const name of ["Fade Slide", "Glitch Reveal"]) {
    const samples = await sampleThumb(page, name);
    expect(new Set(samples).size, `${name} changes over time: ${samples.join(" ; ")}`).toBeGreaterThan(1);
  }
});
test("with reduced motion every preview is a static frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.mouse.move(2, 2);
  for (const name of ["Fade Slide", "Glitch Reveal"]) {
    const samples = await sampleThumb(page, name);
    expect(new Set(samples).size, `${name} stays still: ${samples.join(" ; ")}`).toBe(1);
    expect(samples[0]!.endsWith("|none"), `${name} has no animation`).toBe(true);
  }
});
/** The playback rates of every animation inside one card's preview. */
async function rates(page: Page, effectName: string): Promise<number[]> {
  return await cards(page).filter({ hasText: effectName }).evaluate((card) => card.getAnimations({ subtree: true }).map((a) => a.playbackRate));
}
test("hovering a card plays its preview at 2.5x and leaves the other cards at 1x", async ({ page }) => {
  await open(page);
  await page.mouse.move(2, 2);
  expect((await rates(page, "Fade Slide")).length, "the preview is animating").toBeGreaterThan(0);
  await cards(page).filter({ hasText: "Fade Slide" }).hover();
  const hot = await rates(page, "Fade Slide");
  expect(hot.every((r) => r === 2.5), `hovered card rates: ${hot.join(",")}`).toBe(true);
  const other = await rates(page, "Wave");
  expect(other.length).toBeGreaterThan(0);
  expect(other.every((r) => r === 1), `other card rates: ${other.join(",")}`).toBe(true);
});
test("leaving a card resets its preview to 1x", async ({ page }) => {
  await open(page);
  await cards(page).filter({ hasText: "Fade Slide" }).hover();
  expect((await rates(page, "Fade Slide")).every((r) => r === 2.5)).toBe(true);
  await page.mouse.move(2, 2);
  const after = await rates(page, "Fade Slide");
  expect(after.length).toBeGreaterThan(0);
  expect(after.every((r) => r === 1), `rates after leaving: ${after.join(",")}`).toBe(true);
});
test("keyboard focus plays a card's preview at 2.5x and blur resets it", async ({ page }) => {
  await open(page);
  await page.mouse.move(2, 2);
  await cards(page).filter({ hasText: "Blur In" }).focus();
  const focused = await rates(page, "Blur In");
  expect(focused.every((r) => r === 2.5), `focused card rates: ${focused.join(",")}`).toBe(true);
  expect((await rates(page, "Wave")).every((r) => r === 1)).toBe(true);
  await library(page).getByRole("searchbox", { name: "Search effects" }).focus();
  const blurred = await rates(page, "Blur In");
  expect(blurred.every((r) => r === 1), `rates after blur: ${blurred.join(",")}`).toBe(true);
});
test("a reopened library starts at 1x", async ({ page }) => {
  await open(page);
  await cards(page).filter({ hasText: "Fade Slide" }).hover();
  await page.keyboard.press("Escape");
  await expect(library(page)).toBeHidden();
  await page.mouse.move(2, 2);
  await openButton(page).click();
  const reopened = await rates(page, "Fade Slide");
  expect(reopened.length).toBeGreaterThan(0);
  expect(reopened.every((r) => r === 1), `rates after reopening: ${reopened.join(",")}`).toBe(true);
});
test("with reduced motion, hovering a card throws nothing and there are no animations", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await cards(page).filter({ hasText: "Fade Slide" }).hover();
  await cards(page).filter({ hasText: "Blur In" }).focus();
  expect(await rates(page, "Fade Slide")).toEqual([]);
  expect(await rates(page, "Blur In")).toEqual([]);
  expect(errors).toEqual([]);
});
