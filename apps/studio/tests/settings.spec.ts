import { test, expect } from "@playwright/test";
import { gotoStudio, previewCanvas, readReadout, setProjectDuration, settingsPanel } from "./helpers.js";
/**
 * Project settings (Requirement 2): size presets and custom size within the engine
 * bounds, fps and duration, background and transparency, and rejection of
 * out-of-bound values with an inline message and no invalid value written.
 */
const canvasSize = async (page: import("@playwright/test").Page) => ({
  w: Number(await previewCanvas(page).getAttribute("width")),
  h: Number(await previewCanvas(page).getAttribute("height")),
});
const cornerPixel = (page: import("@playwright/test").Page) =>
  previewCanvas(page).evaluate((el) => Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(2, 2, 1, 1).data));
test("size presets and a custom size change the canvas", async ({ page }) => {
  await gotoStudio(page, false);
  const s = settingsPanel(page);
  expect(await canvasSize(page)).toEqual({ w: 1280, h: 720 });
  await s.getByLabel("Size preset").selectOption({ label: "1080x1920" });
  await expect(s.getByLabel("Width")).toHaveValue("1080");
  await expect(s.getByLabel("Height")).toHaveValue("1920");
  expect(await canvasSize(page)).toEqual({ w: 1080, h: 1920 });
  await s.getByLabel("Width").fill("800");
  expect(await canvasSize(page)).toEqual({ w: 800, h: 1920 });
  await expect(s.getByLabel("Size preset")).toHaveValue("800x1920");
});
test("fps and duration set the frame count", async ({ page }) => {
  await gotoStudio(page, false);
  const s = settingsPanel(page);
  await s.getByLabel("FPS").fill("24");
  await setProjectDuration(page, "2.5");
  expect((await readReadout(page)).total).toBe(60);
  // A duration shorter than a layer end is rejected until the layers are shortened.
  await s.getByLabel("Duration (s)").fill("1");
  await expect(s.getByRole("alert")).toBeVisible();
  await expect(s.getByLabel("Duration (s)")).toHaveValue("2.5");
});
test("background colour and transparency", async ({ page }) => {
  await gotoStudio(page, false);
  const s = settingsPanel(page);
  await s.getByLabel("Background").fill("#ff0000");
  await expect.poll(() => cornerPixel(page)).toEqual([255, 0, 0, 255]);
  await s.getByLabel("Transparent").check();
  await expect(s.getByLabel("Background")).toBeDisabled();
  await expect.poll(async () => (await cornerPixel(page))[3]).toBe(0);
  await s.getByLabel("Transparent").uncheck();
  await expect(s.getByLabel("Background")).toBeEnabled();
  // Turning transparency off restores an opaque black background.
  await expect.poll(() => cornerPixel(page)).toEqual([0, 0, 0, 255]);
});
test("out-of-bound values are rejected with a message and never written", async ({ page }) => {
  await gotoStudio(page, false);
  const s = settingsPanel(page);
  const cases: { label: string; bad: string; good: string; message: RegExp }[] = [
    { label: "Width", bad: "0", good: "1280", message: /Width must be/ },
    { label: "Width", bad: "7681", good: "1280", message: /Width must be/ },
    { label: "Height", bad: "4321", good: "720", message: /Height must be/ },
    { label: "FPS", bad: "0", good: "30", message: /FPS must be/ },
    { label: "FPS", bad: "121", good: "30", message: /FPS must be/ },
    { label: "Duration (s)", bad: "0", good: "5", message: /Duration must be/ },
    { label: "Duration (s)", bad: "601", good: "5", message: /Duration must be/ },
  ];
  for (const c of cases) {
    await s.getByLabel(c.label).fill(c.bad);
    await expect(s.getByRole("alert"), `${c.label}=${c.bad}`).toContainText(c.message);
    await expect(s.getByLabel(c.label), `${c.label} keeps its value`).toHaveValue(c.good);
  }
  expect(await canvasSize(page)).toEqual({ w: 1280, h: 720 });
  expect((await readReadout(page)).total).toBe(150);
  // A valid edit clears the message.
  await s.getByLabel("FPS").fill("60");
  await expect(s.getByRole("alert")).toHaveCount(0);
});
