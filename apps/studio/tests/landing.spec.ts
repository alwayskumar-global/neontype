import { test, expect } from "@playwright/test";
import { gotoStudio, previewCanvas, layerField } from "./helpers.js";

/**
 * Landing page (first screen). Renders all section headings, claims only what
 * the app does (no WebM/WebP/Lottie/embed text), and routes into the studio via
 * the CTAs with browser Back returning to the landing.
 */

const SECTION_HEADINGS = [
  "Animated titles, made in your browser.",
  "Type, animate, export",
  "Export for where it's going",
  "Made with the built-in effects",
  "Runs entirely in your browser. Nothing is uploaded.",
];

test("landing renders all sections and only true claims", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  for (const h of SECTION_HEADINGS) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  for (const banned of ["webm", "webp", "lottie", "embed", "motion-text"]) {
    expect(body, `landing must not mention ${banned}`).not.toContain(banned);
  }
  // Nav + footer.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub repo" })).toBeVisible();
});

test("Open the studio reveals the studio with a non-blank canvas", async ({ page }) => {
  await gotoStudio(page, true);
  const nonBlank = await previewCanvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
    return false;
  });
  expect(nonBlank).toBe(true);
});

test("Start blank opens the studio, and Back returns to the landing", async ({ page }) => {
  await gotoStudio(page, false);
  await expect(layerField(page, "Text")).toHaveValue("Your Title");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Animated titles, made in your browser." })).toBeVisible();
});
