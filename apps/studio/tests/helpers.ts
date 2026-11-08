import { expect, type Page } from "@playwright/test";

/**
 * Shared studio entry: load the app (landing first), then open the studio via a
 * hero CTA. `demo` true clicks "Open the studio" (demo project, visible
 * playhead); false clicks "Start blank" (default project). Resolves when the
 * studio canvas is visible.
 */
export async function gotoStudio(page: Page, demo = true): Promise<void> {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Animated titles, made in your browser." })).toBeVisible();
  const label = demo ? "Open the studio" : "Start blank";
  await page.getByRole("button", { name: label }).first().click();
  await expect(page.locator("canvas.preview-canvas")).toBeVisible();
}
