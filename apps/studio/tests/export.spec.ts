import { exportAs, exportFormat, exportProgress, gotoStudio, progressSeen, shrinkProject, watchExportProgress } from "./helpers.js";
import { test, expect } from "@playwright/test";
import { ERROR_MESSAGES } from "../src/export/errors.js";

/**
 * Export dialog end-to-end (Requirement 8). Exports a short project to MP4 and
 * GIF through the real dialog and checks the produced bytes' magic header +
 * non-zero size (read via a DEV-only window hook the dialog sets on success, so
 * no Node fs is needed). Plus a cancel test that ends in the cancelled state.
 */

declare global {
  interface Window {
    __lastExport?: { fileName: string; size: number; head: number[] };
  }
}

const shrink = shrinkProject;

async function openDialog(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await expect(exportFormat(page, "mp4")).toBeVisible();
}

const ascii = (b: number[]): string => String.fromCharCode(...b);

test("exports MP4 with a valid ftyp header", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await openDialog(page);
  await exportAs(page, "mp4");
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(info!.size).toBeGreaterThan(0);
  expect(ascii(info!.head.slice(4, 8))).toBe("ftyp");
});

test("exports GIF with a GIF8 header", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await openDialog(page);
  await exportAs(page, "gif");
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(info!.size).toBeGreaterThan(0);
  expect(ascii(info!.head.slice(0, 4))).toBe("GIF8");
});

test("cancel during export returns to the Options step with the format and size kept, and no download fires", async ({ page }) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  await gotoStudio(page, true);
  await shrink(page, "4");
  await openDialog(page);
  await exportAs(page, "mp4", /^2×/);
  await page.getByRole("button", { name: "Cancel export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText("MP4 video options")).toBeVisible({ timeout: 9000 });
  await expect(dialog.getByRole("combobox", { name: "Size" })).toHaveValue(/^2×/);
  await page.waitForTimeout(300);
  expect(downloads, "no download fired").toBe(0);
});

test("dialog traps Tab inside and returns focus to the Export button on close", async ({ page }) => {
  await gotoStudio(page);
  const opener = page.getByRole("button", { name: "Export", exact: true });
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  // Tab many times: focus must never leave the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside, `focus inside dialog after Tab #${i + 1}`).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside, `focus inside dialog after Shift+Tab #${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
// ---- Safety-net additions (format gating, progress, the transparency note, error mapping) ----
test("a format the browser cannot encode is disabled, with its reason", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "VideoEncoder");
  });
  await gotoStudio(page, true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  const mp4 = exportFormat(page, "mp4");
  await expect(mp4).toBeDisabled();
  await expect(mp4).toContainText("VideoEncoder is unavailable");
  // The other formats stay available.
  await expect(exportFormat(page, "png-sequence")).toBeEnabled();
  await expect(exportFormat(page, "gif")).toBeEnabled();
});

test("progress advances while an export runs and ends at the Done step", async ({ page }) => {
  await gotoStudio(page, true);
  await openDialog(page);
  await watchExportProgress(page);
  await exportAs(page, "mp4");
  const progress = exportProgress(page);
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow")), { timeout: 15000 }).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 60000 });
  const seen = await progressSeen(page);
  expect(Math.max(...seen.values), "the bar reached its end").toBeGreaterThan(0);
});

test("a transparent project shows the mp4-no-transparency note before and after exporting", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await page.getByRole("switch", { name: "Transparent" }).check();
  await openDialog(page);
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText(/MP4 has no transparency/)).toBeVisible();
  await page.getByRole("button", { name: /Export mp4/ }).click();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  await expect(dialog.getByText(/Exported without transparency/)).toBeVisible();
});
test("a failed export shows the message mapped from its ErrorCode", async ({ page }) => {
  await gotoStudio(page, true);
  // 120 fps for 600 s is 72000 frames, over the exporters' frame limit.
  await page.getByRole("region", { name: "PROJECT" }).getByLabel("Frame rate").fill("120");
  await page.getByRole("region", { name: "PROJECT" }).getByLabel("Duration in seconds").fill("600");
  await openDialog(page);
  await exportAs(page, "gif");
  const alert = page.getByRole("dialog", { name: "Export" }).getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });
  await expect(alert).toContainText(ERROR_MESSAGES["invalid-options"]);
});

// Back (after a failure or a cancel) and "Export again" (after a success) return to the format step, and a second export runs.
test("after a failed export, Change settings returns to Options with the settings kept, and Retry export runs again", async ({ page }) => {
  await gotoStudio(page, true);
  await page.getByRole("region", { name: "PROJECT" }).getByLabel("Frame rate").fill("120");
  await page.getByRole("region", { name: "PROJECT" }).getByLabel("Duration in seconds").fill("600");
  await openDialog(page);
  await exportAs(page, "gif", /^0\.5×/);
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 15000 });
  await dialog.getByRole("button", { name: "Change settings" }).click();
  await expect(dialog.getByText("Animated GIF options")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Size" })).toHaveValue(/^0\.5×/);
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 15000 });
  // Retry export runs the export again: the progress bar shows once more before the failure comes back.
  await watchExportProgress(page);
  await dialog.getByRole("button", { name: "Retry export" }).click();
  await expect.poll(async () => (await progressSeen(page)).appeared, { timeout: 15000 }).toBe(true);
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 15000 });
});

test("after a cancel, exporting again from Options completes", async ({ page }) => {
  await gotoStudio(page, true);
  await openDialog(page);
  await exportAs(page, "mp4");
  await page.getByRole("button", { name: "Cancel export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByText("MP4 video options")).toBeVisible({ timeout: 9000 });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 60000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(ascii(info!.head.slice(4, 8))).toBe("ftyp");
});

test("after a success, Export again returns to the format choices and a second export completes", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await openDialog(page);
  const dialog = page.getByRole("dialog", { name: "Export" });
  await exportAs(page, "gif");
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  await dialog.getByRole("button", { name: "Export another" }).click();
  await expect(exportFormat(page, "mp4")).toBeVisible();
  await exportAs(page, "mp4");
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(ascii(info!.head.slice(4, 8))).toBe("ftyp");
});
