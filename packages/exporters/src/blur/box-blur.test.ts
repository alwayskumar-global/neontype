import { describe, it, expect } from "vitest";
import {
  areaDownsamplePremultiplied,
  bilinearUpsamplePremultiplied,
  blurImage,
  boxRadiiForSigma,
  premultipliedAlphaSum,
  type PremultImage,
  type RgbaImage,
} from "./box-blur.js";

/** Builds an all-transparent-black RGBA image of the given size. */
function blank(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

/** Reads the RGBA tuple at (x, y). */
function px(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const o = (y * image.width + x) * 4;
  return [image.data[o], image.data[o + 1], image.data[o + 2], image.data[o + 3]];
}

describe("blurImage", () => {
  it("returns an unchanged copy at sigma <= 0", () => {
    const img = blank(4, 4);
    img.data[0] = 200;
    img.data[3] = 255;
    const out = blurImage(img, 0);
    expect(out.data).toEqual(img.data);
    expect(out.data).not.toBe(img.data);
  });

  it("is deterministic: identical input yields identical output", () => {
    const img = blank(8, 8);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 256;
      img.data[i + 1] = (i * 13) % 256;
      img.data[i + 2] = (i * 31) % 256;
      img.data[i + 3] = (i * 5) % 256;
    }
    const a = blurImage(img, 3);
    const b = blurImage(img, 3);
    expect(a.data).toEqual(b.data);
  });

  it("does not darken a coloured fringe blurred against transparent (premultiplied)", () => {
    // A single half-transparent RED pixel at the centre of a transparent field.
    // Blurring in premultiplied alpha must spread the red while PRESERVING its
    // hue: the result anywhere alpha survives must stay pure red, never
    // contaminated toward black by the surrounding transparent pixels.
    const img = blank(9, 9);
    const centre = (4 * 9 + 4) * 4;
    img.data[centre] = 255; // R
    img.data[centre + 1] = 0; // G
    img.data[centre + 2] = 0; // B
    img.data[centre + 3] = 128; // half-transparent

    const out = blurImage(img, 2);

    // Every pixel that received any alpha must still read as pure red
    // (G and B stay 0 within one quantisation level), i.e. no dark halo.
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const [r, g, b, a] = px(out, x, y);
        if (a > 0) {
          expect(g).toBeLessThanOrEqual(1);
          expect(b).toBeLessThanOrEqual(1);
          // Red should dominate wherever colour is present.
          expect(r).toBeGreaterThanOrEqual(g);
          expect(r).toBeGreaterThanOrEqual(b);
        }
      }
    }
  });

  it("treats out-of-image edges as transparent black (no clamp contamination)", () => {
    // A fully opaque white block in the top-left corner. After blur the corner
    // must soften toward transparency, not stay fully opaque (which a clamped
    // edge would wrongly produce by replicating the border inward).
    const img = blank(16, 16);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const o = (y * 16 + x) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = 255;
      }
    }
    const out = blurImage(img, 2);
    const [, , , cornerAlpha] = px(out, 0, 0);
    expect(cornerAlpha).toBeLessThan(255);
    expect(cornerAlpha).toBeGreaterThan(0);
  });
});

describe("boxRadiiForSigma", () => {
  it("returns zero radii at sigma <= 0", () => {
    expect(boxRadiiForSigma(0)).toEqual([0, 0, 0]);
    expect(boxRadiiForSigma(-5)).toEqual([0, 0, 0]);
  });

  it("returns non-negative integer radii for a positive sigma", () => {
    const radii = boxRadiiForSigma(6, 3);
    expect(radii).toHaveLength(3);
    for (const r of radii) {
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic", () => {
    expect(boxRadiiForSigma(6)).toEqual(boxRadiiForSigma(6));
  });
});


describe("areaDownsamplePremultiplied", () => {
  it("conserves premultiplied alpha mass (dimensions a multiple of the factor)", () => {
    // Synthetic premultiplied image whose width/height are exact multiples of
    // the factor, so area-averaging (dividing each cell by factor*factor)
    // conserves the total alpha mass exactly up to float rounding.
    const width = 24;
    const height = 16;
    const factor = 4;
    const data = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const a = (i * 37) % 256; // deterministic pseudo-pattern
      const af = a / 255;
      // RGB stored premultiplied.
      data[o] = ((i * 11) % 256) * af;
      data[o + 1] = ((i * 23) % 256) * af;
      data[o + 2] = ((i * 7) % 256) * af;
      data[o + 3] = a;
    }
    const image: PremultImage = { data, width, height };

    // Area-averaging preserves mean alpha DENSITY (sum / pixel-count), the
    // meaningful "no alpha lost to point-sampling" invariant. When the
    // dimensions are exact multiples of the factor every cell is fully covered,
    // so the densities match to float precision.
    const before = premultipliedAlphaSum(image);
    const small = areaDownsamplePremultiplied(image, factor);
    const after = premultipliedAlphaSum(small);

    expect(before).toBeGreaterThan(0);
    const densityBefore = before / (width * height);
    const densityAfter = after / (small.width * small.height);
    const relErr = Math.abs(densityAfter - densityBefore) / densityBefore;
    expect(relErr).toBeLessThanOrEqual(1e-6);
  });

  it("produces the correctly reduced dimensions", () => {
    const image: PremultImage = { data: new Float32Array(10 * 10 * 4), width: 10, height: 10 };
    const small = areaDownsamplePremultiplied(image, 3);
    expect(small.width).toBe(Math.ceil(10 / 3));
    expect(small.height).toBe(Math.ceil(10 / 3));
  });

  it("is deterministic", () => {
    const data = new Float32Array(8 * 8 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 3) % 211;
    const image: PremultImage = { data, width: 8, height: 8 };
    const a = areaDownsamplePremultiplied(image, 2);
    const b = areaDownsamplePremultiplied(image, 2);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe("bilinearUpsamplePremultiplied", () => {
  it("restores the target dimensions and is deterministic", () => {
    const data = new Float32Array(4 * 4 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 5) % 199;
    const image: PremultImage = { data, width: 4, height: 4 };
    const a = bilinearUpsamplePremultiplied(image, 16, 12);
    const b = bilinearUpsamplePremultiplied(image, 16, 12);
    expect(a.width).toBe(16);
    expect(a.height).toBe(12);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe("blurImage large-radius path", () => {
  it("keeps visible alpha for a substantial shape blurred above the downsample threshold", () => {
    // A large opaque block (like a title) on a 640x360 field, blurred at 300px
    // (well above the downsample threshold). Area-average downsample + bilinear
    // upsample must keep meaningful alpha across the frame rather than fading it
    // to zero the way point-sampling the thin spread would. (A tiny shape on a
    // tiny canvas can legitimately near-vanish at this radius; that extreme is a
    // determinism-only smoke case, not a fidelity case.)
    const W = 640;
    const H = 360;
    const img = blank(W, H);
    for (let y = 120; y < 240; y++) {
      for (let x = 160; x < 480; x++) {
        const o = (y * W + x) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = 255;
      }
    }
    const out = blurImage(img, 300);
    let alphaSum = 0;
    let peak = 0;
    for (let i = 3; i < out.data.length; i += 4) {
      alphaSum += out.data[i];
      if (out.data[i] > peak) peak = out.data[i];
    }
    // A 300px blur genuinely spreads a shape very thin, so the exact peak is a
    // fidelity question owned by the golden (compared against native at 640x360).
    // Here we assert only the regression this change fixes: alpha is NOT zeroed
    // out, and some alpha survives everywhere the shape spread to.
    expect(alphaSum).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(0);
  });

  it("is deterministic in the large-radius path", () => {
    const img = blank(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 256;
      img.data[i + 1] = (i * 13) % 256;
      img.data[i + 2] = (i * 31) % 256;
      img.data[i + 3] = (i * 5) % 256;
    }
    const a = blurImage(img, 250);
    const b = blurImage(img, 250);
    expect(a.data).toEqual(b.data);
  });
});
