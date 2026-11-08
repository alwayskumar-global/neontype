/**
 * Unit tests for the FilterStrippingContext and the exporter-local blur
 * (Task 3.1). A recording fake `CanvasLike` captures the call stream so we can
 * assert redirection, compositing, pass-through, and no-layer-leak.
 */

import { describe, it, expect } from "vitest";

import {
  FilterStrippingContext,
  parseBlurFilter,
  type CanvasLike,
  type BlurLayer,
  type LayerFactory,
} from "./filter-stripping-context.js";
import { blurImage, boxRadiiForSigma, type RgbaImage } from "./box-blur.js";

/** A recording fake 2D context capturing method calls and property writes. */
function makeRecorder(tag: string) {
  const calls: string[] = [];
  const ctx: CanvasLike = {
    filter: "none",
    globalAlpha: 1,
    fillStyle: "#000000",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save: () => void calls.push(`${tag}.save`),
    restore: () => void calls.push(`${tag}.restore`),
    clearRect: (x, y, w, h) => void calls.push(`${tag}.clearRect(${x},${y},${w},${h})`),
    fillRect: (x, y, w, h) => void calls.push(`${tag}.fillRect(${x},${y},${w},${h})`),
    translate: (x, y) => void calls.push(`${tag}.translate(${x},${y})`),
    rotate: (a) => void calls.push(`${tag}.rotate(${a})`),
    scale: (x, y) => void calls.push(`${tag}.scale(${x},${y})`),
    setTransform: () => void calls.push(`${tag}.setTransform`),
    fillText: (t, x, y) => void calls.push(`${tag}.fillText(${t},${x},${y})`),
    drawImage: (_img, dx, dy) => void calls.push(`${tag}.drawImage(${dx},${dy})`),
  };
  // Track filter writes explicitly.
  let filterValue = "none";
  Object.defineProperty(ctx, "filter", {
    get: () => filterValue,
    set: (v: string) => {
      filterValue = v;
      calls.push(`${tag}.filter=${v}`);
    },
    configurable: true,
  });
  return { ctx, calls };
}

/** A fake layer factory producing recording layers over a shared counter. */
function makeLayerFactory(created: { count: number; disposed: number }): LayerFactory {
  return (width, height): BlurLayer => {
    created.count += 1;
    const rec = makeRecorder("layer");
    const image: RgbaImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
    return {
      ctx: rec.ctx,
      readImage: () => image,
      toDrawable: (img) => img,
      dispose: () => {
        created.disposed += 1;
      },
    };
  };
}

describe("parseBlurFilter", () => {
  it("parses blur(Npx) with N>0 and rejects none/zero/other", () => {
    expect(parseBlurFilter("blur(4px)")).toBe(4);
    expect(parseBlurFilter("blur( 2.5px )")).toBe(2.5);
    expect(parseBlurFilter("none")).toBeNull();
    expect(parseBlurFilter("blur(0px)")).toBeNull();
    expect(parseBlurFilter("sepia(1)")).toBeNull();
  });
});

describe("FilterStrippingContext — no-blur pass-through", () => {
  it("forwards every call to the real ctx and creates no layer when filter stays none/0", () => {
    const real = makeRecorder("real");
    const created = { count: 0, disposed: 0 };
    const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 100, 100);

    wrap.save();
    wrap.filter = "none";
    wrap.globalAlpha = 0.5;
    wrap.translate(10, 20);
    wrap.fillStyle = "#ffffff";
    wrap.fillText("a", 0, 0);
    wrap.restore();

    expect(created.count).toBe(0);
    expect(wrap.liveLayerCount).toBe(0);
    // The draw calls reached the real context (not a layer).
    expect(real.calls).toContain("real.translate(10,20)");
    expect(real.calls).toContain("real.fillText(a,0,0)");
    // The real filter is never a browser blur.
    expect(real.calls.every((c) => !c.startsWith("real.filter=blur"))).toBe(true);
  });

  it("blur(0px) is treated as no blur — no layer", () => {
    const real = makeRecorder("real");
    const created = { count: 0, disposed: 0 };
    const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 50, 50);
    wrap.save();
    wrap.filter = "blur(0px)";
    wrap.fillText("x", 0, 0);
    wrap.restore();
    expect(created.count).toBe(0);
    expect(real.calls).toContain("real.fillText(x,0,0)");
  });
});

describe("FilterStrippingContext — blurred scope redirect + composite", () => {
  it("redirects a blurred scope to a layer and composites on restore", () => {
    const real = makeRecorder("real");
    const created = { count: 0, disposed: 0 };
    const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 64, 64);

    wrap.save();
    wrap.filter = "blur(4px)";
    wrap.fillText("g", 1, 2); // should go to the layer, not real
    wrap.restore();

    expect(created.count).toBe(1);
    expect(created.disposed).toBe(1);
    expect(wrap.liveLayerCount).toBe(0);
    // The glyph was drawn to the layer, not the real context.
    expect(real.calls).not.toContain("real.fillText(g,1,2)");
    // The blurred layer was composited back via drawImage.
    expect(real.calls.some((c) => c.startsWith("real.drawImage"))).toBe(true);
    // Real filter never became a browser blur.
    expect(real.calls.every((c) => !c.startsWith("real.filter=blur"))).toBe(true);
  });

  it("handles nested save/restore inside a blurred scope without double-compositing", () => {
    const real = makeRecorder("real");
    const created = { count: 0, disposed: 0 };
    const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 32, 32);

    wrap.save();
    wrap.filter = "blur(3px)";
    wrap.save(); // nested scope inherits the layer
    wrap.fillText("n", 0, 0);
    wrap.restore(); // must NOT composite (layer belongs to parent)
    wrap.restore(); // composites once

    expect(created.count).toBe(1);
    expect(created.disposed).toBe(1);
    expect(wrap.liveLayerCount).toBe(0);
    const drawImageCount = real.calls.filter((c) => c.startsWith("real.drawImage")).length;
    expect(drawImageCount).toBe(1);
  });
});

describe("FilterStrippingContext — no layer leak on unbalanced sequences", () => {
  it("flush() composites/disposes a dangling blurred scope left unrestored", () => {
    const real = makeRecorder("real");
    const created = { count: 0, disposed: 0 };
    const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 16, 16);

    wrap.save();
    wrap.filter = "blur(2px)";
    wrap.fillText("d", 0, 0);
    // No matching restore (early exit); flush must not leak.
    wrap.flush();

    expect(created.count).toBe(1);
    expect(created.disposed).toBe(1);
    expect(wrap.liveLayerCount).toBe(0);
  });
});

describe("box-blur determinism", () => {
  it("blurImage is deterministic for identical input", () => {
    const img: RgbaImage = { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 };
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 7) % 256;
    const a = blurImage(img, 3);
    const b = blurImage(img, 3);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("sigma<=0 returns the input unchanged", () => {
    const img: RgbaImage = { data: new Uint8ClampedArray([1, 2, 3, 4]), width: 1, height: 1 };
    expect(Array.from(blurImage(img, 0).data)).toEqual([1, 2, 3, 4]);
  });

  it("boxRadiiForSigma returns three non-negative integer radii", () => {
    const radii = boxRadiiForSigma(5, 3);
    expect(radii.length).toBe(3);
    for (const r of radii) {
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ----------------------------- Property tests ----------------------------- */

import fc from "fast-check";

// Feature: exporters, Property 9: Exporter-local blur determinism and no-blur pass-through
describe("Property 9: Exporter-local blur determinism and no-blur pass-through", () => {
  it("blurImage is byte-identical for identical input across radii > 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (w, h, sigma) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) % 256;
          const img = { data, width: w, height: h };
          const a = blurImage(img, sigma);
          const b = blurImage(img, sigma);
          expect(Array.from(a.data)).toEqual(Array.from(b.data));
          expect(a.width).toBe(w);
          expect(a.height).toBe(h);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("a no-blur scope forwards every draw to the real ctx and creates no layer", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("translate", "fillText", "alpha", "save", "restore"), { minLength: 1, maxLength: 20 }),
        (ops) => {
          const real = makeRecorder("real");
          const created = { count: 0, disposed: 0 };
          const wrap = new FilterStrippingContext(real.ctx, makeLayerFactory(created), 40, 40);
          let depth = 0;
          for (const op of ops) {
            if (op === "save") { wrap.save(); depth++; }
            else if (op === "restore") { if (depth > 0) { wrap.restore(); depth--; } }
            else if (op === "translate") wrap.translate(1, 1);
            else if (op === "fillText") wrap.fillText("x", 0, 0);
            else if (op === "alpha") { wrap.globalAlpha = 0.5; }
          }
          while (depth-- > 0) wrap.restore();
          // Never set a blur filter → never created a layer, never leaked.
          expect(created.count).toBe(0);
          expect(wrap.liveLayerCount).toBe(0);
          expect(real.calls.every((c) => !c.startsWith("real.filter=blur"))).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });
});
