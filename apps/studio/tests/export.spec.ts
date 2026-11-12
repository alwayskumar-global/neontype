import { gotoStudio, shrinkProject } from "./helpers.js";
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
  await expect(page.getByRole("button", { name: /Export mp4/ })).toBeVisible();
}

const ascii = (b: number[]): string => String.fromCharCode(...b);

test("exports MP4 with a valid ftyp header", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await openDialog(page);
  await page.getByRole("button", { name: /Export mp4/ }).click();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(info!.size).toBeGreaterThan(0);
  expect(ascii(info!.head.slice(4, 8))).toBe("ftyp");
});

test("exports GIF with a GIF8 header", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await openDialog(page);
  await page.getByRole("button", { name: /Export gif/ }).click();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 9000 });
  const info = await page.evaluate(() => window.__lastExport);
  expect(info!.size).toBeGreaterThan(0);
  expect(ascii(info!.head.slice(0, 4))).toBe("GIF8");
});

test("cancel during export ends in the cancelled state", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "4");
  await openDialog(page);
  await page.getByRole("button", { name: /Export mp4/ }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Export cancelled.")).toBeVisible({ timeout: 9000 });
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
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  const mp4 = dialog.getByRole("button", { name: /Export mp4/ });
  await expect(mp4).toBeDisabled();
  await expect(mp4).toHaveText(/unsupported/);
  await expect(mp4).toHaveAttribute("title", /.+/);
  // The other formats stay available.
  await expect(dialog.getByRole("button", { name: /Export png-sequence/ })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: /Export gif/ })).toBeEnabled();
});
test("progress advances while an export runs", async ({ page }) => {
  await gotoStudio(page, true);
  await openDialog(page);
  await page.getByRole("button", { name: /Export mp4/ }).click();
  const progress = page.getByRole("progressbar", { name: "Export progress" });
  await expect(progress).toBeVisible();
  await expect.poll(() => progress.evaluate((el) => (el as HTMLProgressElement).value), { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Export cancelled.")).toBeVisible();
});
test("a transparent project shows the mp4-no-transparency note before and after exporting", async ({ page }) => {
  await gotoStudio(page, true);
  await shrink(page, "0.3");
  await page.getByLabel("Transparent").check();
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
  await page.getByRole("region", { name: "Project settings" }).getByLabel("FPS").fill("120");
  await page.getByRole("region", { name: "Project settings" }).getByLabel("Duration (s)").fill("600");
  await openDialog(page);
  await page.getByRole("button", { name: /Export gif/ }).click();
  const alert = page.getByRole("dialog", { name: "Export" }).getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });
  const text = ((await alert.innerText()) ?? "").trim();
  expect(Object.values(ERROR_MESSAGES)).toContain(text);
});
// KNOWN BUG, found while writing this spec: "reset" returns the machine to idle, but the
// capability check runs only when the dialog mounts, so Back (after a failure or a cancel) and
// "Export again" leave the dialog on "Detecting capabilities..." with no format buttons.
// Un-fixme when the dialog re-detects or the reset goes back to configuring.
test.fixme("Back after a failed export returns to the format choices", async ({ page }) => {
  await gotoStudio(page, true);
  await page.getByRole("region", { name: "Project settings" }).getByLabel("FPS").fill("120");
  await page.getByRole("region", { name: "Project settings" }).getByLabel("Duration (s)").fill("600");
  await openDialog(page);
  await page.getByRole("button", { name: /Export gif/ }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 15000 });
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /Export mp4/ })).toBeVisible();
});
