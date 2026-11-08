import { test, expect } from "@playwright/test";

import { parseGif } from "../../src/__tests__/helpers/gif-reader.js";

/**
 * Animated GIF via the WORKER (Req 6). Runs exportGif -> dispatchExport ->
 * worker-entry over the localhost harness in bundled Chromium, then parses the
 * GIF with the hand-written reader: valid GIF89a header, frame count equals the
 * project frame count, every frame delay is round(100/fps) centiseconds, the
 * palette is <= 256 colors, and the transparency flag matches the project's
 * background (set for transparent, clear for an opaque hex background).
 */

declare global {
  interface Window {
    runGifExport: (background: string) => Promise<{
      ok: boolean;
      code?: string;
      bytes: number[];
      frameCount?: number;
    }>;
  }
}

const FPS = 10;
const EXPECTED_FRAMES = Math.round(0.4 * FPS); // 0.4s @ 10fps = 4
const EXPECTED_DELAY_CS = Math.round(100 / FPS); // 10

for (const [background, transparentExpected] of [
  ["#123456", false],
  ["transparent", true],
] as const) {
  test(`GIF via the worker: header, frames, delays, transparency (${background})`, async ({
    page,
  }) => {
    await page.goto("http://localhost:5273/");
    await page.waitForFunction(() => typeof window.runGifExport === "function");

    const r = await page.evaluate((bg) => window.runGifExport(bg), background);
    expect(r.ok, `export failed: ${r.code ?? ""}`).toBe(true);
    expect(r.frameCount).toBe(EXPECTED_FRAMES);

    const info = parseGif(Uint8Array.from(r.bytes));
    expect(info.width).toBe(32);
    expect(info.height).toBe(24);
    expect(info.frames).toHaveLength(EXPECTED_FRAMES);
    expect(info.loopCount).toBe(0); // forever

    for (const f of info.frames) {
      expect(f.delayCentiseconds).toBe(EXPECTED_DELAY_CS);
      expect(f.paletteSize).toBeLessThanOrEqual(256);
      expect(f.transparent).toBe(transparentExpected);
    }
  });
}
