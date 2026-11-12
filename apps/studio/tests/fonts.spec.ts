import { test, expect, type Page } from "@playwright/test";
import { gotoStudio, previewCanvas } from "./helpers.js";

/**
 * Fonts loaded before layout (bug-fix regression). After opening the studio with
 * the demo at t=3s:
 *   (a) all four bundled faces pass `document.fonts.check` (real fonts, not a
 *       fallback) so canvas measurement/paint use the bundled metrics;
 *   (b) the title layer's drawn pixel bbox is horizontally centered on its
 *       anchor x (640) within 4px and lies fully inside the canvas;
 *   (c) the Tamil layer's drawn pixel bbox is likewise centered within 4px and
 *       inside the canvas (regression guard for broken Tamil clusters);
 *   (d) a PNG-sequence export of the frame at the same time matches the preview
 *       within the existing parity tolerance (export uses the same real fonts).
 */

async function enterAtT3(page: Page): Promise<void> {
  await gotoStudio(page, true);
  await page.getByLabel("Scrub").fill("3");
  await page.waitForTimeout(80);
}

/**
 * Horizontal bbox of pixels close to `rgb` on the preview canvas (ignores the
 * `#101018` background and other layers). Returns `maxX = -1` when the color is
 * absent. A generous per-channel tolerance keeps anti-aliased glyph edges in.
 */
async function colorBBox(
  page: Page,
  rgb: [number, number, number],
  tol = 60,
): Promise<{ minX: number; maxX: number; minY: number; maxY: number; w: number; h: number }> {
  return await previewCanvas(page).evaluate(
    (el, { rgb, tol }) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, maxX = -1, minY = c.height, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (
            d[i + 3] > 40 &&
            Math.abs(d[i] - rgb[0]) <= tol &&
            Math.abs(d[i + 1] - rgb[1]) <= tol &&
            Math.abs(d[i + 2] - rgb[2]) <= tol
          ) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { minX, maxX, minY, maxY, w: c.width, h: c.height };
    },
    { rgb, tol },
  );
}

test("(a) all bundled faces are ready for canvas", async ({ page }) => {
  await enterAtT3(page);
  const checks = await page.evaluate(() => ({
    sans700: document.fonts.check('700 16px "Noto Sans"'),
    tamil700: document.fonts.check('700 16px "Noto Sans Tamil"'),
    sans400: document.fonts.check('400 16px "Noto Sans"'),
    tamil400: document.fonts.check('400 16px "Noto Sans Tamil"'),
  }));
  expect(checks).toEqual({ sans700: true, tamil700: true, sans400: true, tamil400: true });
});

test("(b) title layer is centered on its anchor and inside the canvas", async ({ page }) => {
  await enterAtT3(page);
  // Demo title "Motion Text" fill #ffcc00, anchor x = 640 on a 1280 canvas,
  // center align. At t=3 the kinetic-pop effect has fully settled.
  const b = await colorBBox(page, [0xff, 0xcc, 0x00]);
  expect(b.maxX, "title pixels present").toBeGreaterThanOrEqual(0);
  const center = (b.minX + b.maxX) / 2;
  expect(Math.abs(center - 640), "title centered on anchor x").toBeLessThanOrEqual(4);
  expect(b.minX, "title not clipped left").toBeGreaterThanOrEqual(0);
  expect(b.maxX, "title not clipped right").toBeLessThanOrEqual(b.w - 1);
});

test("(c) Tamil layer is centered on its anchor and inside the canvas", async ({ page }) => {
  await enterAtT3(page);
  // Demo Tamil "வணக்கம்" fill #2dd3f0, anchor x = 640, center align. At t=3 the
  // typewriter has revealed all clusters. A broken (fallback) shape would shift
  // or mis-measure the clusters and fail the centering/inside checks.
  const b = await colorBBox(page, [0x2d, 0xd3, 0xf0]);
  expect(b.maxX, "tamil pixels present").toBeGreaterThanOrEqual(0);
  const center = (b.minX + b.maxX) / 2;
  expect(Math.abs(center - 640), "tamil centered on anchor x").toBeLessThanOrEqual(4);
  expect(b.minX, "tamil not clipped left").toBeGreaterThanOrEqual(0);
  expect(b.maxX, "tamil not clipped right").toBeLessThanOrEqual(b.w - 1);
});

test("(d) PNG-sequence export frame matches the preview within tolerance", async ({ page }) => {
  await enterAtT3(page);
  const ratio = await page.evaluate(
    () => (window as unknown as { __studioExportParity?: (t?: number) => Promise<number> }).__studioExportParity?.(3),
  );
  expect(ratio, "export parity probe present").toBeDefined();
  expect(ratio!, "worker-path export frame is identical to the preview").toBe(0);
});
