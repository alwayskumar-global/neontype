import { test, expect } from "@playwright/test";

/**
 * Font support in the worker path (Req 13.11, 13.12, 15). One frame with Latin
 * and Tamil text is rendered by the preview (main thread, fonts registered),
 * the WORKER export with `fonts`, the MAIN-THREAD export with `fonts`, and the
 * WORKER export without `fonts`. With fonts, both export paths must be
 * pixel-identical to the preview (diffRatio 0). Without fonts the worker measures
 * a fallback and must differ. After the main-thread run, document.fonts holds
 * no face the export added.
 */
test("worker and main-thread exports with fonts match the preview exactly; without fonts the worker mismatches", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runFontParity === "function");
  const r = await page.evaluate(() => window.runFontParity());
  expect(r.hasWorker, "worker path is available").toBe(true);
  expect(r.workerWithFonts, "worker with fonts vs preview").toBe(0);
  expect(r.mainWithFonts, "main thread with fonts vs preview").toBe(0);
  expect(r.workerWithoutFonts, "worker without fonts mismatches").toBeGreaterThan(0);
  expect(r.documentFacesAfter, "exports leave document.fonts as they found it").toBe(0);
  expect(r.callerBytesIntact, "caller's font buffers are not detached").toBe(true);
});
