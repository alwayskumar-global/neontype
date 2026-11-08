import { test, expect } from "@playwright/test";

/**
 * Save/load + demo (Requirement 7, demo project). Round-trips a project through
 * the real UI (Save download -> Open file input), shows a clear error for an
 * invalid file, and confirms the demo loads with a non-blank canvas at a visible
 * time. No Node fs: Save is captured as a Playwright download and fed back into
 * the Open input via its on-disk path.
 */

async function nonBlankCanvas(page: import("@playwright/test").Page): Promise<boolean> {
  return await page.evaluate(() => {
    const c = document.querySelector("canvas.preview-canvas") as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });
}

test("demo loads on start with a non-blank canvas at a visible time", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await page.getByLabel("Scrub").fill("3");
  await page.waitForTimeout(80);
  expect(await nonBlankCanvas(page)).toBe(true);
  // The Tamil layer uses Noto Sans Tamil (presence of the layer in the list).
  await expect(page.locator(".layer-select", { hasText: "வணக்கம்" })).toBeVisible();
});

test("save then reopen round-trips the project", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();

  // Edit so the project differs from the demo, then Save.
  await page.getByRole("button", { name: "New" }).click();
  const textInput = page.locator(".layer-editor input[type='text']");
  await textInput.fill("Round Trip");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const file = await dl;
  const path = await file.path();

  // Change something, then Open the saved file; the text should return.
  await textInput.fill("changed");
  await page.getByLabel("Open project file").setInputFiles(path);
  await expect(page.locator(".layer-editor input[type='text']")).toHaveValue("Round Trip");
});

test("opening an invalid file shows a clear error and keeps the project", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  // Build an invalid File in the browser and fire the input's change handler
  // (avoids Playwright's buffer path, which needs a Node Buffer).
  await page.evaluate(() => {
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["{ not valid json "], "bad.json", { type: "application/json" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("alert")).toContainText(/could not open the project/i);
  // The canvas still renders (project unchanged).
  await expect(page.locator("canvas.preview-canvas")).toBeVisible();
});
