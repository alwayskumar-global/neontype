import { test, expect, type Page } from "@playwright/test";
import { gotoStudio } from "./helpers.js";

/**
 * Timeline editing (Requirement 5, 12.6, 16): a ruler that scrubs, per-layer bars
 * and handles that are focusable sliders with ARIA in seconds, drag that snaps to
 * the frame grid and commits one undo step, and Arrow-key stepping.
 */

const FPS = 30;

const slider = (page: Page, name: string) => page.getByRole("slider", { name, exact: true });
const val = async (page: Page, name: string): Promise<number> => Number(await slider(page, name).getAttribute("aria-valuenow"));
const onFrame = (s: number): boolean => Math.abs(s * FPS - Math.round(s * FPS)) < 1e-4;

test("bars and handles are focusable sliders with ARIA values in seconds", async ({ page }) => {
  await gotoStudio(page, true);
  for (const part of ["move", "start", "end"]) {
    const el = slider(page, `Motion Text, ${part}`);
    await expect(el).toHaveAttribute("tabindex", "0");
    await expect(el).toHaveAttribute("aria-valuemin", /.+/);
    await expect(el).toHaveAttribute("aria-valuemax", /.+/);
    await expect(el).toHaveAttribute("aria-valuetext", /seconds$/);
  }
  expect(await val(page, "Motion Text, start")).toBe(0);
  expect(await val(page, "Motion Text, end")).toBe(6);
});

test("dragging an end handle changes the duration and snaps to a frame; one undo restores it", async ({ page }) => {
  await gotoStudio(page, true);
  const handle = slider(page, "Motion Text, end");
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const durationField = page.locator(".layer-editor").getByLabel("Duration (s)");
  const d0 = Number(await durationField.inputValue());

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 3 });
  await page.mouse.move(x - 137, y, { steps: 5 });
  await page.mouse.up();

  const end = await val(page, "Motion Text, end");
  expect(end).toBeLessThan(6);
  expect(onFrame(end), `end ${end} lies on the ${FPS} fps grid`).toBe(true);
  expect(Number(await durationField.inputValue())).toBeLessThan(d0);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await val(page, "Motion Text, end")).toBe(6);
  expect(Number(await durationField.inputValue())).toBe(d0);
});

test("dragging the bar moves the layer and keeps its length", async ({ page }) => {
  await gotoStudio(page, true);
  // The subtitle runs 1.4 to 6; trim its end first so there is room to move.
  const startBefore = await val(page, "built in the browser, start");
  const endBefore = await val(page, "built in the browser, end");
  const bar = slider(page, "built in the browser, move");
  const b = (await bar.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 60, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  const s = await val(page, "built in the browser, start");
  const e = await val(page, "built in the browser, end");
  expect(s).toBeLessThan(startBefore);
  expect(onFrame(s) && onFrame(e)).toBe(true);
  expect(Math.round((e - s) * FPS)).toBe(Math.round((endBefore - startBefore) * FPS));
});

test("Arrow keys step a focused handle 1 frame, Shift 10 frames, one undo step each", async ({ page }) => {
  await gotoStudio(page, true);
  const handle = slider(page, "Motion Text, end");
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  expect(await val(page, "Motion Text, end")).toBeCloseTo(6 - 1 / FPS, 5);
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await val(page, "Motion Text, end")).toBeCloseTo(6 - 11 / FPS, 5);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await val(page, "Motion Text, end")).toBeCloseTo(6 - 1 / FPS, 5);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await val(page, "Motion Text, end")).toBe(6);
});

test("the ruler scrubs the playhead to a frame", async ({ page }) => {
  await gotoStudio(page, true);
  const ruler = page.getByRole("slider", { name: "Playhead" });
  const b = (await ruler.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2);
  const t = Number(await ruler.getAttribute("aria-valuenow"));
  expect(t).toBeGreaterThan(2.5);
  expect(t).toBeLessThan(3.5);
  expect(onFrame(t)).toBe(true);
  await ruler.focus();
  await page.keyboard.press("ArrowRight");
  expect(Number(await ruler.getAttribute("aria-valuenow"))).toBeCloseTo(t + 1 / FPS, 5);
});
