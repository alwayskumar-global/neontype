import { test, expect } from "@playwright/test";

/**
 * Preview/export parity (Requirement 9). For one fixture project (two layers,
 * one with a blur effect) at three times, the preview path (renderFrame into a
 * canvas) and the exporter's FrameRenderer path (what every export uses) must
 * match within tolerance (24/255 per channel, diffRatio <= 0.01), composited
 * over the same opaque background. The comparison runs inside the app module
 * graph (window.__studioParityProbe) so the bundler resolves @studio/engine and
 * the exporter FrameRenderer; each canvas uses its own CanvasMetricsProvider.
 */

declare global {
  interface Window {
    __studioParityProbe?: () => Promise<number[]>;
  }
}

test("preview frames match the exporter FrameRenderer within tolerance", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.__studioParityProbe === "function");

  const ratios = await page.evaluate(() => window.__studioParityProbe!());
  expect(ratios).toHaveLength(3);
  for (const r of ratios) {
    expect(r, `diffRatio ${r}`).toBeLessThanOrEqual(0.01);
  }
});
