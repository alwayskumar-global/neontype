import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { FrameState, LayerState } from "@studio/engine";
import { ASCENT_RATIO, layerBounds, rectContains, hitTest, clientToCanvas, dragAnchor, nudgeAnchor } from "./hit.js";

type Seg = LayerState["segments"][number];
function seg(text: string, layoutX: number, width = 10, layoutY = 0, height = 10): Seg {
  return { text, charIndex: 0, wordIndex: 0, lineIndex: 0, layoutX, layoutY, width, height, effectOverrides: null };
}
function layer(id: string, anchor: { x: number; y: number }, segments: ReturnType<typeof seg>[], off: [number, number] = [0, 0]): LayerState {
  return {
    layerId: id, fill: "#fff", fontFamily: "Noto Sans", fontSize: 10, fontWeight: "400", align: "left", anchor,
    letterSpacing: 0, lineHeight: 1.2,
    transform: { positionOffset: off, scale: 1, rotation: 0, opacity: 1, blur: 0, colorOverride: null },
    segments,
  };
}
const state = (layers: LayerState[]): FrameState => ({ canvasWidth: 200, canvasHeight: 100, background: "#000", layers, warnings: [] });

describe("layerBounds", () => {
  it("is the union of visible cluster boxes shifted by anchor + positionOffset", () => {
    const b = layerBounds(layer("a", { x: 100, y: 50 }, [seg("a", -10), seg("b", 0)], [5, -5]))!;
    expect(b.x).toBe(100 + 5 - 10);
    expect(b.w).toBe(20);
    expect(b.y).toBeCloseTo(50 - 5 - ASCENT_RATIO * 10);
    expect(b.h).toBeCloseTo(10);
  });
  it("ignores collapsible whitespace clusters and returns null when none are visible", () => {
    const l = layer("a", { x: 0, y: 0 }, [seg(" ", 0), seg("\n", 10)]);
    expect(layerBounds(l)).toBeNull();
    const l2 = layer("a", { x: 0, y: 0 }, [seg("a", 0), seg(" ", 10, 10), seg("\n", 20)]);
    expect(layerBounds(l2)!.w).toBe(10);
  });
  it("ignores effect overrides, scale, rotation, blur and opacity", () => {
    const l = layer("a", { x: 0, y: 0 }, [{ ...seg("a", 0), effectOverrides: { scale: 5, opacity: 0, positionOffset: [99, 99] } }]);
    l.transform = { ...l.transform, scale: 3, rotation: 45, blur: 9, opacity: 0 };
    expect(layerBounds(l)).toEqual(layerBounds(layer("a", { x: 0, y: 0 }, [seg("a", 0)])));
  });
});

describe("hitTest", () => {
  const a = layer("a", { x: 50, y: 50 }, [seg("a", 0)]);
  const b = layer("b", { x: 50, y: 50 }, [seg("b", 0)]);
  it("topmost (last) layer wins", () => {
    expect(hitTest(state([a, b]), 55, 48, 1)).toBe("b");
    expect(hitTest(state([b, a]), 55, 48, 1)).toBe("a");
  });
  it("pads by 8 / displayScale canvas px", () => {
    const s = state([a]);
    expect(hitTest(s, 50 - 7, 48, 1)).toBe("a");
    expect(hitTest(s, 50 - 9, 48, 1)).toBeNull();
    expect(hitTest(s, 50 - 15, 48, 0.5)).toBe("a"); // slop is 16 canvas px at half scale
    expect(hitTest(s, 50 - 17, 48, 0.5)).toBeNull();
  });
  it("treats a bad display scale as 1 and returns null on empty canvas", () => {
    expect(hitTest(state([a]), 55, 48, 0)).toBe("a");
    expect(hitTest(state([a]), 500, 500, 1)).toBeNull();
    expect(hitTest(state([]), 1, 1, 1)).toBeNull();
  });
  it("rectContains is inclusive of the padded edge", () => {
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, 12, 5, 2)).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, 12.1, 5, 2)).toBe(false);
  });
});

describe("clientToCanvas", () => {
  it("maps viewport px to canvas px and returns null for a zero-size rect", () => {
    const rect = { left: 10, top: 20, width: 640, height: 360 };
    expect(clientToCanvas(10 + 320, 20 + 180, rect, { width: 1280, height: 720 })).toEqual({ x: 640, y: 360 });
    expect(clientToCanvas(0, 0, { ...rect, width: 0 }, { width: 1280, height: 720 })).toBeNull();
    expect(clientToCanvas(0, 0, { ...rect, height: 0 }, { width: 1280, height: 720 })).toBeNull();
  });
});

describe("dragAnchor / nudgeAnchor", () => {
  const canvas = { width: 200, height: 100 };
  const base = { startAnchor: { x: 50, y: 50 }, startPointer: { x: 10, y: 10 }, canvas };
  it("adds the pointer delta, rounded and clamped", () => {
    expect(dragAnchor({ ...base, pointer: { x: 20.4, y: 15.6 }, shift: false })).toEqual({ x: 60, y: 56 });
    expect(dragAnchor({ ...base, pointer: { x: 9999, y: -9999 }, shift: false })).toEqual({ x: 200, y: 0 });
  });
  it("Shift keeps the dominant axis; a tie keeps x", () => {
    expect(dragAnchor({ ...base, pointer: { x: 30, y: 15 }, shift: true })).toEqual({ x: 70, y: 50 });
    expect(dragAnchor({ ...base, pointer: { x: 15, y: 30 }, shift: true })).toEqual({ x: 50, y: 70 });
    expect(dragAnchor({ ...base, pointer: { x: 20, y: 20 }, shift: true })).toEqual({ x: 60, y: 50 });
  });
  it("snaps to a multiple of snap and falls back to 1 for a bad snap", () => {
    expect(dragAnchor({ ...base, pointer: { x: 17, y: 10 }, shift: false, snap: 10 })).toEqual({ x: 60, y: 50 });
    expect(dragAnchor({ ...base, pointer: { x: 17, y: 10 }, shift: false, snap: -5 })).toEqual({ x: 57, y: 50 });
  });
  it("nudges 1 / 10 px, clamps, and ignores other keys", () => {
    expect(nudgeAnchor({ x: 50, y: 50 }, "ArrowRight", false, canvas)).toEqual({ x: 51, y: 50 });
    expect(nudgeAnchor({ x: 50, y: 50 }, "ArrowUp", true, canvas)).toEqual({ x: 50, y: 40 });
    expect(nudgeAnchor({ x: 0, y: 0 }, "ArrowLeft", true, canvas)).toEqual({ x: 0, y: 0 });
    expect(nudgeAnchor({ x: 50, y: 50 }, "a", false, canvas)).toBeNull();
  });
});

// Feature: studio, Property 6: Drag identity
describe("Property 6: drag identity", () => {
  it("dragAnchor(start, start.pointer) equals the start anchor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: -500, max: 3000, noNaN: true }), fc.double({ min: -500, max: 3000, noNaN: true }),
        fc.boolean(), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }),
        (w, h, px, py, shift, fx, fy) => {
          const startAnchor = { x: Math.round(fx * w), y: Math.round(fy * h) };
          const out = dragAnchor({ startAnchor, startPointer: { x: px, y: py }, pointer: { x: px, y: py }, shift, canvas: { width: w, height: h } });
          expect(out).toEqual(startAnchor);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// Feature: studio, Property 7: Drag stays in canvas and on the grid
describe("Property 7: drag stays in canvas", () => {
  it("is always inside the canvas and on the whole-pixel grid", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: -5000, max: 5000, noNaN: true }), fc.double({ min: -5000, max: 5000, noNaN: true }),
        fc.double({ min: -5000, max: 5000, noNaN: true }), fc.double({ min: -5000, max: 5000, noNaN: true }),
        fc.double({ min: -100, max: 3000, noNaN: true }), fc.double({ min: -100, max: 3000, noNaN: true }),
        fc.boolean(),
        (w, h, spx, spy, px, py, ax, ay, shift) => {
          const out = dragAnchor({ startAnchor: { x: ax, y: ay }, startPointer: { x: spx, y: spy }, pointer: { x: px, y: py }, shift, canvas: { width: w, height: h } });
          expect(out.x).toBeGreaterThanOrEqual(0);
          expect(out.x).toBeLessThanOrEqual(w);
          expect(out.y).toBeGreaterThanOrEqual(0);
          expect(out.y).toBeLessThanOrEqual(h);
          expect(Number.isInteger(out.x)).toBe(true);
          expect(Number.isInteger(out.y)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
