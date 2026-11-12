import { test, expect } from "@playwright/test";
import { gotoStudio, isOn, readReadout, seek, setProjectDuration } from "./helpers.js";
/**
 * Preview transport (Requirements 1.2-1.8): play advances, pause holds, loop wraps,
 * scrub clamps without starting playback, and the frame and time readout is
 * correct. Locators are role, label, and text only. The default project is
 * 1280x720, 30 fps, 5 s, so it has 150 frames.
 */
const play = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Play" }).first();
const pause = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Pause" }).first();
const loop = (page: import("@playwright/test").Page) => page.getByLabel("Loop").first();
const scrub = (page: import("@playwright/test").Page) => ({ fill: (seconds: string) => seek(page, Number(seconds)) });
test("the readout shows the frame, the total frame count, and the time", async ({ page }) => {
  await gotoStudio(page, false);
  expect(await readReadout(page)).toEqual({ frame: 0, total: 150, time: 0 });
  await scrub(page).fill("1");
  expect(await readReadout(page)).toEqual({ frame: 30, total: 150, time: 1 });
  await scrub(page).fill("2.5");
  expect(await readReadout(page)).toEqual({ frame: 75, total: 150, time: 2.5 });
});
test("Play advances the readout and Pause holds it", async ({ page }) => {
  await gotoStudio(page, false);
  await play(page).click();
  await expect.poll(async () => (await readReadout(page)).time, { timeout: 4000 }).toBeGreaterThan(0.3);
  await pause(page).click();
  await page.waitForTimeout(100);
  const held = await readReadout(page);
  await page.waitForTimeout(500);
  expect(await readReadout(page)).toEqual(held);
});
test("with Loop on, playback wraps to the start", async ({ page }) => {
  await gotoStudio(page, false);
  await setProjectDuration(page, "0.6");
  expect(await isOn(loop(page))).toBe(true);
  await play(page).click();
  let wrapped = false;
  let last = -1;
  for (let i = 0; i < 40 && !wrapped; i++) {
    const t = (await readReadout(page)).time;
    if (last >= 0 && t < last) wrapped = true;
    last = t;
    await page.waitForTimeout(60);
  }
  expect(wrapped, "the readout time went down at least once").toBe(true);
});
test("with Loop off, playback stops on the last frame", async ({ page }) => {
  await gotoStudio(page, false);
  await setProjectDuration(page, "0.5");
  if (await isOn(loop(page))) await loop(page).click();
  expect(await isOn(loop(page))).toBe(false);
  await play(page).click();
  await expect.poll(async () => (await readReadout(page)).frame, { timeout: 4000 }).toBe(14);
  const end = await readReadout(page);
  await page.waitForTimeout(400);
  expect(await readReadout(page)).toEqual(end);
});
test("scrubbing clamps to the first and last frame and does not start playback", async ({ page }) => {
  await gotoStudio(page, false);
  await scrub(page).fill("99");
  const last = await readReadout(page);
  expect(last).toEqual({ frame: 149, total: 150, time: 5 });
  await page.waitForTimeout(300);
  expect(await readReadout(page)).toEqual(last);
  await scrub(page).fill("-4");
  expect(await readReadout(page)).toEqual({ frame: 0, total: 150, time: 0 });
  await page.waitForTimeout(300);
  expect((await readReadout(page)).frame).toBe(0);
});
