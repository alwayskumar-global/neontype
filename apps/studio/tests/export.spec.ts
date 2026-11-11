import { gotoStudio } from "./helpers.js";
import { test, expect } from "@playwright/test";

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

async function shrink(page: import("@playwright/test").Page, duration: string): Promise<void> {
  const nums = page.locator(".app-left .panel input[type='number']");
  await nums.nth(0).fill("160"); // width
  await nums.nth(1).fill("90");  // height
  await nums.nth(3).fill(duration); // duration (index 2 is fps)
  await page.waitForTimeout(50);
}

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
