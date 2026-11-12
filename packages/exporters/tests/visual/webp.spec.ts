import { test, expect } from "@playwright/test";
import { readAnimatedWebp } from "../../src/__tests__/helpers/webp-reader.js";
/**
 * Animated WebP via the WORKER (Req 7), a real encode in bundled Chromium over the localhost harness. GATED: it
 * runs only when the browser can encode a still image/webp (the same probe the capability report uses) and is
 * skipped with a visible reason otherwise. The output is parsed back with the hand-written reader and then decoded
 * by the browser (ImageDecoder; a bitmap fallback would check only the first frame).
 */
declare global {
  interface Window {
    webpProbe: () => Promise<string>;
    runWebpExport: (background: string) => Promise<{ ok: boolean; code?: string; bytes: number[]; frameCount?: number }>;
    decodeWebp: (bytes: number[]) => Promise<{ viaImageDecoder: boolean; frameCount: number; corners: number[][] }>;
  }
}
const FPS = 10;
const EXPECTED_FRAMES = Math.round(0.4 * FPS); // 0.4 s @ 10 fps = 4
for (const [background, transparentExpected] of [
  ["#123456", false],
  ["transparent", true],
] as const) {
  test(`animated WebP via the worker: container, decode, alpha (${background})`, async ({ page }) => {
    await page.goto("http://localhost:5273/");
    await page.waitForFunction(() => typeof window.runWebpExport === "function");
    const probe = await page.evaluate(() => window.webpProbe());
    test.skip(probe !== "image/webp", `this browser cannot encode a still image/webp (probe returned "${probe}"); animated WebP export is unsupported here`);
    const r = await page.evaluate((bg) => window.runWebpExport(bg), background);
    expect(r.ok, `export failed: ${r.code ?? ""}`).toBe(true);
    expect(r.frameCount).toBe(EXPECTED_FRAMES);
    const bytes = Uint8Array.from(r.bytes);
    // Container, parsed by the hand-reader.
    const info = readAnimatedWebp(bytes);
    expect(info.animation).toBe(true);
    expect(info.alpha).toBe(transparentExpected);
    expect([info.canvasWidth, info.canvasHeight]).toEqual([32, 24]);
    expect(info.frames).toHaveLength(EXPECTED_FRAMES);
    expect(info.frames.reduce((a, f) => a + f.durationMs, 0)).toBe(400);
    for (const f of info.frames) expect(f.chunks.some((c) => c.id === "VP8 " || c.id === "VP8L")).toBe(true);
    // The browser decodes it.
    const decoded = await page.evaluate((b) => window.decodeWebp(b), r.bytes);
    expect(decoded.viaImageDecoder, "ImageDecoder is available in bundled Chromium").toBe(true);
    expect(decoded.frameCount).toBe(EXPECTED_FRAMES);
    for (const [i, px] of decoded.corners.entries()) {
      if (transparentExpected) {
        expect(px[3], `frame ${i}: a transparent pixel stays transparent`).toBe(0);
      } else {
        expect(px[3], `frame ${i}: opaque`).toBe(255);
        // Lossy YUV coding moves the colour a little; #123456 = (18, 52, 86).
        expect(Math.abs(px[0]! - 0x12)).toBeLessThanOrEqual(8);
        expect(Math.abs(px[1]! - 0x34)).toBeLessThanOrEqual(8);
        expect(Math.abs(px[2]! - 0x56)).toBeLessThanOrEqual(8);
      }
    }
  });
}
