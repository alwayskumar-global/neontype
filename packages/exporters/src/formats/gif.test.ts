import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

import { gifDelayCentiseconds, GIF_MAX_COLORS, runGifExport } from "./gif.js";
import type { Project } from "@studio/engine";
import { parseGif } from "../__tests__/helpers/gif-reader.js";

/** Builds a tiny multi-color RGBA frame buffer deterministically. */
function frame(width: number, height: number, seed: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    d[o] = (i * 7 + seed) % 256;
    d[o + 1] = (i * 13 + seed) % 256;
    d[o + 2] = (i * 29 + seed) % 256;
    d[o + 3] = 255;
  }
  return d;
}

/** Encodes `frames` frames at `fps` into a GIF (mirrors the exporter's calls). */
function encodeGif(fps: number, frames: number, transparent: boolean): Uint8Array {
  const w = 8;
  const h = 8;
  const gif = GIFEncoder();
  const delayMs = gifDelayCentiseconds(fps) * 10;
  for (let i = 0; i < frames; i++) {
    const rgba = frame(w, h, i * 17);
    const format = transparent ? "rgba4444" : "rgb565";
    const palette = quantize(rgba, GIF_MAX_COLORS, { format, oneBitAlpha: transparent });
    const indexed = applyPalette(rgba, palette, format);
    gif.writeFrame(indexed, w, h, {
      palette,
      delay: delayMs,
      repeat: 0,
      transparent,
      transparentIndex: transparent ? 0 : undefined,
    });
  }
  gif.finish();
  return gif.bytesView().slice();
}

describe("gifDelayCentiseconds", () => {
  it("is round(100/fps) centiseconds", () => {
    expect(gifDelayCentiseconds(10)).toBe(10);
    expect(gifDelayCentiseconds(30)).toBe(3); // round(3.33)
    expect(gifDelayCentiseconds(24)).toBe(4); // round(4.16)
    expect(gifDelayCentiseconds(60)).toBe(2); // round(1.66)
  });
});

describe("GIF encode (hand-reader)", () => {
  it("writes the delay in centiseconds the reader sees", () => {
    const gif = encodeGif(10, 3, false);
    const info = parseGif(gif);
    expect(info.frames).toHaveLength(3);
    for (const f of info.frames) expect(f.delayCentiseconds).toBe(gifDelayCentiseconds(10));
  });

  it("sets the transparency flag for a transparent project and not otherwise", () => {
    const opaque = parseGif(encodeGif(12, 2, false));
    expect(opaque.frames.every((f) => !f.transparent)).toBe(true);
    const transp = parseGif(encodeGif(12, 2, true));
    expect(transp.frames.every((f) => f.transparent)).toBe(true);
  });

  it("keeps the palette at or below 256 colors", () => {
    const info = parseGif(encodeGif(10, 1, false));
    expect(info.globalPaletteSize).toBeLessThanOrEqual(256);
  });
});

// Feature: exporters, Property 7: GIF delay and palette bound
describe("Property 7: GIF delay and palette bound", () => {
  it("every frame delay = round(100/fps) cs and every palette <= 256 colors", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 120 }), fc.integer({ min: 1, max: 4 }), (fps, frames) => {
        const gif = encodeGif(fps, frames, false);
        const info = parseGif(gif);
        const expected = gifDelayCentiseconds(fps);
        expect(info.frames).toHaveLength(frames);
        for (const f of info.frames) {
          expect(f.delayCentiseconds).toBe(expected);
          expect(f.paletteSize).toBeLessThanOrEqual(256);
        }
      }),
      { numRuns: 100 },
    );
  });
});


/** A minimal valid project for the capability-guard test. */
function gifProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 16, height: 16, fps: 10, durationSeconds: 0.2 },
    background: "#101018",
    seed: 1,
    layers: [
      {
        id: "g", text: "x", tracks: [], effectInstances: [],
        fontFamily: "sans-serif", fontSize: 10, fontWeight: "bold", fill: "#ffffff",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 0.2, anchor: { x: 8, y: 12 },
      },
    ],
  } as Project;
}

describe("runGifExport capability guard", () => {
  it("returns browser-unsupported when OffscreenCanvas is unavailable (Node)", async () => {
    // Node (vitest environment: node) has no OffscreenCanvas, exercising the guard.
    const r = await runGifExport(gifProject(), {}, () => {}, () => false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("browser-unsupported");
  });
});
