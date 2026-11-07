/**
 * Unit tests for `drawFrame` (Task 9.2) plus the hardening contract.
 *
 * `drawFrame` is the only part of the pipeline that touches a
 * `CanvasRenderingContext2D`, so these tests run against a RECORDING FAKE
 * context: every method is a `vi.fn()` and every settable property is captured,
 * so a test can assert exactly what the painter did. A shared `recordedCalls`
 * log preserves the ordered sequence of `save`/`restore` calls so every test can
 * assert the stack stays balanced and never goes negative.
 *
 * Coverage:
 *   - transparent background → clearRect, no fillRect;
 *   - hex background → fillStyle set + fillRect;
 *   - blur > 0 → filter = 'blur(Npx)'; blur = 0 → filter = 'none';
 *   - fillText called exactly once per segment across all layers;
 *   - save/restore balanced (equal counts AND depth never negative, ends at 0)
 *     asserted in EVERY test case;
 *   - hardening: non-finite values never reach the canvas; invalid color
 *     overrides are ignored; blur clamps to 1000; scale clamps to 100.
 */

import { describe, it, expect, vi } from "vitest";

import { drawFrame } from "./draw.js";
import type { FrameState, LayerState, BaseSegment } from "./compute.js";

/** A recording fake 2D context: `vi.fn()` methods + captured properties. */
interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  /** Ordered log of method names as they were called. */
  calls: string[];
  /** Per-call arguments, keyed by method name. */
  args: Record<string, unknown[][]>;
  /** The sequence of values assigned to each settable property, in order. */
  props: {
    fillStyle: unknown[];
    globalAlpha: unknown[];
    filter: unknown[];
    font: unknown[];
    textAlign: unknown[];
    textBaseline: unknown[];
  };
}

/** Methods the painter is allowed to call on the context. */
const METHODS = [
  "clearRect",
  "fillRect",
  "save",
  "restore",
  "translate",
  "rotate",
  "scale",
  "fillText",
] as const;

/** Builds a fresh recording fake context for one drawFrame call. */
function makeRecordingContext(): RecordingContext {
  const calls: string[] = [];
  const args: Record<string, unknown[][]> = {};
  const props: RecordingContext["props"] = {
    fillStyle: [],
    globalAlpha: [],
    filter: [],
    font: [],
    textAlign: [],
    textBaseline: [],
  };

  const target: Record<string, unknown> = {};
  for (const name of METHODS) {
    args[name] = [];
    target[name] = vi.fn((...callArgs: unknown[]) => {
      calls.push(name);
      args[name].push(callArgs);
    });
  }

  // Settable properties record every assignment in order.
  for (const key of Object.keys(props) as (keyof RecordingContext["props"])[]) {
    let current: unknown;
    Object.defineProperty(target, key, {
      get: () => current,
      set: (value: unknown) => {
        current = value;
        props[key].push(value);
      },
      enumerable: true,
      configurable: true,
    });
  }

  return {
    ctx: target as unknown as CanvasRenderingContext2D,
    calls,
    args,
    props,
  };
}

/**
 * Asserts the save/restore sequence is balanced: equal counts, the running
 * depth (saves - restores) never goes negative, and it ends at exactly 0. Run
 * in every test to guarantee the context stack cannot leak on any path.
 */
function expectBalancedSaveRestore(calls: string[]): void {
  let depth = 0;
  let saves = 0;
  let restores = 0;
  for (const call of calls) {
    if (call === "save") {
      depth += 1;
      saves += 1;
    } else if (call === "restore") {
      depth -= 1;
      restores += 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
  }
  expect(depth).toBe(0);
  expect(saves).toBe(restores);
}

/** Builds a minimal `BaseSegment` with sensible defaults. */
function makeSegment(overrides: Partial<BaseSegment> = {}): BaseSegment {
  return {
    text: "a",
    charIndex: 0,
    wordIndex: 0,
    lineIndex: 0,
    layoutX: 0,
    layoutY: 0,
    width: 10,
    height: 16,
    effectOverrides: null,
    ...overrides,
  };
}

/** Builds a minimal `LayerState` with sensible defaults. */
function makeLayerState(overrides: Partial<LayerState> = {}): LayerState {
  return {
    layerId: "layer-1",
    fill: "#ffffff",
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "400",
    align: "left",
    anchor: { x: 0, y: 0 },
    letterSpacing: 0,
    lineHeight: 1.2,
    transform: {
      positionOffset: [0, 0],
      scale: 1,
      rotation: 0,
      opacity: 1,
      blur: 0,
      colorOverride: null,
    },
    segments: [makeSegment()],
    ...overrides,
  };
}

/** Builds a minimal `FrameState` with sensible defaults. */
function makeState(overrides: Partial<FrameState> = {}): FrameState {
  return {
    canvasWidth: 800,
    canvasHeight: 450,
    background: "#000000",
    layers: [makeLayerState()],
    warnings: [],
    ...overrides,
  };
}

/** Counts total segments across all layers of a state. */
function totalSegments(state: FrameState): number {
  return state.layers.reduce((sum, l) => sum + l.segments.length, 0);
}

describe("drawFrame — background", () => {
  it("transparent background clears the canvas and does not fill", () => {
    const { ctx, args, calls } = makeRecordingContext();
    const state = makeState({ background: "transparent" });

    drawFrame(ctx, state);

    expect(args.clearRect).toHaveLength(1);
    expect(args.clearRect[0]).toEqual([0, 0, 800, 450]);
    expect(args.fillRect).toHaveLength(0);
    expectBalancedSaveRestore(calls);
  });

  it("hex background sets fillStyle to that hex and fills the canvas", () => {
    const { ctx, args, props, calls } = makeRecordingContext();
    const state = makeState({ background: "#123456" });

    drawFrame(ctx, state);

    expect(props.fillStyle[0]).toBe("#123456");
    expect(args.fillRect).toHaveLength(1);
    expect(args.fillRect[0]).toEqual([0, 0, 800, 450]);
    expect(args.clearRect).toHaveLength(0);
    expectBalancedSaveRestore(calls);
  });
});

describe("drawFrame — filter / blur", () => {
  it("sets filter to 'blur(Npx)' for a segment with blur > 0", () => {
    const { ctx, props, calls } = makeRecordingContext();
    const segment = makeSegment({ effectOverrides: { blur: 4 } });
    const state = makeState({ layers: [makeLayerState({ segments: [segment] })] });

    drawFrame(ctx, state);

    expect(props.filter).toContain("blur(4px)");
    expectBalancedSaveRestore(calls);
  });

  it("sets filter to 'none' for a segment with blur = 0", () => {
    const { ctx, props, calls } = makeRecordingContext();
    const segment = makeSegment({ effectOverrides: { blur: 0 } });
    const state = makeState({ layers: [makeLayerState({ segments: [segment] })] });

    drawFrame(ctx, state);

    expect(props.filter).toContain("none");
    expect(props.filter.some((f) => typeof f === "string" && f.startsWith("blur("))).toBe(false);
    expectBalancedSaveRestore(calls);
  });

  it("clamps blur to 1000px (blur = 5000 → 'blur(1000px)')", () => {
    const { ctx, props, calls } = makeRecordingContext();
    const segment = makeSegment({ effectOverrides: { blur: 5000 } });
    const state = makeState({ layers: [makeLayerState({ segments: [segment] })] });

    drawFrame(ctx, state);

    expect(props.filter).toContain("blur(1000px)");
    expect(props.filter).not.toContain("blur(5000px)");
    expectBalancedSaveRestore(calls);
  });
});

describe("drawFrame — fillText per segment", () => {
  it("calls fillText exactly once per segment across all layers", () => {
    const { ctx, args, calls } = makeRecordingContext();
    const state = makeState({
      layers: [
        makeLayerState({
          layerId: "l1",
          segments: [
            makeSegment({ text: "a" }),
            makeSegment({ text: "b" }),
          ],
        }),
        makeLayerState({
          layerId: "l2",
          segments: [makeSegment({ text: "c" })],
        }),
      ],
    });

    drawFrame(ctx, state);

    expect(args.fillText).toHaveLength(totalSegments(state));
    expect(args.fillText).toHaveLength(3);
    expect(args.fillText.map((a) => a[0])).toEqual(["a", "b", "c"]);
    expectBalancedSaveRestore(calls);
  });

  it("stays balanced with an empty layer list", () => {
    const { ctx, args, calls } = makeRecordingContext();
    const state = makeState({ layers: [] });

    drawFrame(ctx, state);

    expect(args.fillText).toHaveLength(0);
    expectBalancedSaveRestore(calls);
  });
});

describe("drawFrame — hardening against untrusted values", () => {
  /** Collects every numeric argument passed to the recorded method calls. */
  function allNumericArgs(args: Record<string, unknown[][]>): number[] {
    const numbers: number[] = [];
    for (const calls of Object.values(args)) {
      for (const callArgs of calls) {
        for (const a of callArgs) {
          if (typeof a === "number") {
            numbers.push(a);
          }
        }
      }
    }
    return numbers;
  }

  it("never passes a non-finite number to any ctx method (NaN/Infinity transforms)", () => {
    const { ctx, args, props, calls } = makeRecordingContext();
    const segment = makeSegment({
      effectOverrides: {
        positionOffset: [Infinity, 0],
        rotation: NaN,
        scale: NaN,
        opacity: NaN,
      },
    });
    const layer = makeLayerState({
      anchor: { x: NaN, y: 0 },
      transform: {
        positionOffset: [Infinity, -Infinity],
        scale: NaN,
        rotation: Infinity,
        opacity: NaN,
        blur: 0,
        colorOverride: null,
      },
      segments: [segment],
    });
    const state = makeState({ layers: [layer] });

    drawFrame(ctx, state);

    for (const n of allNumericArgs(args)) {
      expect(Number.isFinite(n)).toBe(true);
    }
    // globalAlpha assignments must also be finite and in range.
    for (const alpha of props.globalAlpha) {
      expect(typeof alpha).toBe("number");
      expect(Number.isFinite(alpha as number)).toBe(true);
      expect(alpha as number).toBeGreaterThanOrEqual(0);
      expect(alpha as number).toBeLessThanOrEqual(1);
    }
    expectBalancedSaveRestore(calls);
  });

  it("ignores an invalid effect color override and falls back to layer colorOverride then fill", () => {
    const { ctx, props, calls } = makeRecordingContext();
    // Invalid effect color → ignored; layer has a valid colorOverride → used.
    const seg1 = makeSegment({ text: "x", effectOverrides: { color: "red" } });
    const layerWithOverride = makeLayerState({
      fill: "#ffffff",
      transform: {
        positionOffset: [0, 0],
        scale: 1,
        rotation: 0,
        opacity: 1,
        blur: 0,
        colorOverride: "#00ff00",
      },
      segments: [seg1],
    });

    drawFrame(ctx, makeState({ layers: [layerWithOverride] }));

    // The recorded fillStyle for the segment is the layer colorOverride, not "red".
    expect(props.fillStyle).toContain("#00ff00");
    expect(props.fillStyle).not.toContain("red");
    expectBalancedSaveRestore(calls);
  });

  it("falls back to layer.fill when both the effect color and colorOverride are invalid/absent", () => {
    const { ctx, props, calls } = makeRecordingContext();
    const seg = makeSegment({ effectOverrides: { color: "#xyz" } });
    const layer = makeLayerState({
      fill: "#abcdef",
      transform: {
        positionOffset: [0, 0],
        scale: 1,
        rotation: 0,
        opacity: 1,
        blur: 0,
        colorOverride: null,
      },
      segments: [seg],
    });

    drawFrame(ctx, makeState({ layers: [layer] }));

    expect(props.fillStyle).toContain("#abcdef");
    expect(props.fillStyle).not.toContain("#xyz");
    expectBalancedSaveRestore(calls);
  });

  it("ignores a too-short invalid color override (e.g. '#12')", () => {
    const { ctx, props, calls } = makeRecordingContext();
    const seg = makeSegment({ effectOverrides: { color: "#12" } });
    const layer = makeLayerState({ fill: "#010203", segments: [seg] });

    drawFrame(ctx, makeState({ layers: [layer] }));

    expect(props.fillStyle).toContain("#010203");
    expect(props.fillStyle).not.toContain("#12");
    expectBalancedSaveRestore(calls);
  });

  it("clamps segment scale to 100 (scale = 1000 → scale(100, 100))", () => {
    const { ctx, args, calls } = makeRecordingContext();
    const seg = makeSegment({ effectOverrides: { scale: 1000 } });
    const layer = makeLayerState({ segments: [seg] });

    drawFrame(ctx, makeState({ layers: [layer] }));

    // The scale call (if emitted) must carry the clamped value 100, never 1000.
    const scaleArgs = args.scale.map((a) => a[0]);
    expect(scaleArgs).toContain(100);
    expect(scaleArgs).not.toContain(1000);
    expectBalancedSaveRestore(calls);
  });
});


// Feature: effect-presets, Property 9: Pivot fixed point
//
// Requirement 17: a segment's effect scale/rotation pivots about the
// approximate glyph center (width/2, -0.35*fontSize) in the segment-local frame
// (the frame established after translating to the glyph baseline origin). These
// tests replay the ORDERED translate/rotate/scale calls the painter emitted as a
// 2D affine matrix, then confirm the pivot point maps to the same CANVAS
// coordinate with and without the override — i.e. the pivot is the fixed point
// of the transform. A third test confirms a segment with no scale/rotation
// override produces a transform-call sequence identical to current behaviour
// (the Node-level pixel-identical guard; the Chromium golden-image suite is the
// end-to-end guard, Requirement 17.9).

/** A 2D affine matrix [a, b, c, d, e, f] mapping (x,y) → (a x + c y + e, b x + d y + f). */
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m: Mat, n: Mat): Mat {
  // m * n (apply n after m, i.e. m is the existing CTM, n the new op).
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

function translateMat(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}

function scaleMat(sx: number, sy: number): Mat {
  return [sx, 0, 0, sy, 0, 0];
}

function rotateMat(rad: number): Mat {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

function applyPoint(m: Mat, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

/**
 * Replays the ordered translate/rotate/scale calls (as recorded in `calls` with
 * per-method args) into the final CTM at the point drawFrame issued `fillText`.
 * Each test here uses a single layer with a single segment, so every transform
 * op recorded before the sole `fillText` composes into that segment's CTM.
 */
function ctmAtFillText(rc: RecordingContext): Mat {
  let m: Mat = IDENTITY;
  const idx = { translate: 0, rotate: 0, scale: 0 };
  for (const call of rc.calls) {
    if (call === "fillText") break;
    if (call === "translate") {
      const [x, y] = rc.args.translate[idx.translate++] as [number, number];
      m = matMul(m, translateMat(x, y));
    } else if (call === "rotate") {
      const [rad] = rc.args.rotate[idx.rotate++] as [number];
      m = matMul(m, rotateMat(rad));
    } else if (call === "scale") {
      const [sx, sy] = rc.args.scale[idx.scale++] as [number, number];
      m = matMul(m, scaleMat(sx, sy));
    }
  }
  return m;
}

describe("drawFrame — segment pivot (Property 9)", () => {
  const WIDTH = 24;
  const FONT_SIZE = 40;
  const pivotLocal = (): [number, number] => [WIDTH / 2, -0.35 * FONT_SIZE];

  function stateWithOverride(ov: BaseSegment["effectOverrides"]): FrameState {
    const segment = makeSegment({ width: WIDTH, effectOverrides: ov });
    return makeState({
      layers: [makeLayerState({ fontSize: FONT_SIZE, segments: [segment] })],
    });
  }

  it("keeps the pivot point fixed under effect scale = 2", () => {
    const base = makeRecordingContext();
    drawFrame(base.ctx, stateWithOverride(null));
    const baseCtm = ctmAtFillText(base);
    const [bx, by] = applyPoint(baseCtm, ...pivotLocal());

    const scaled = makeRecordingContext();
    drawFrame(scaled.ctx, stateWithOverride({ scale: 2 }));
    const scaledCtm = ctmAtFillText(scaled);
    const [sx, sy] = applyPoint(scaledCtm, ...pivotLocal());

    // The painter actually emitted a scale(2,2).
    expect(scaled.args.scale.map((a) => a[0])).toContain(2);
    // The pivot maps to the same canvas coordinate with and without the scale.
    expect(sx).toBeCloseTo(bx, 9);
    expect(sy).toBeCloseTo(by, 9);
    expectBalancedSaveRestore(scaled.calls);
  });

  it("keeps the pivot point fixed under effect rotation = 90", () => {
    const base = makeRecordingContext();
    drawFrame(base.ctx, stateWithOverride(null));
    const baseCtm = ctmAtFillText(base);
    const [bx, by] = applyPoint(baseCtm, ...pivotLocal());

    const rotated = makeRecordingContext();
    drawFrame(rotated.ctx, stateWithOverride({ rotation: 90 }));
    const rotatedCtm = ctmAtFillText(rotated);
    const [rx, ry] = applyPoint(rotatedCtm, ...pivotLocal());

    // The painter actually emitted a rotate of 90° (π/2).
    expect(rotated.args.rotate.map((a) => a[0] as number)).toContainEqual(
      expect.closeTo(Math.PI / 2, 9),
    );
    // The pivot is the fixed point of the rotation.
    expect(rx).toBeCloseTo(bx, 9);
    expect(ry).toBeCloseTo(by, 9);
    expectBalancedSaveRestore(rotated.calls);
  });

  it("emits a transform-call sequence identical to pre-pivot behaviour when no scale/rotation override is present", () => {
    // A segment with only opacity/position/blur/color overrides (never scale or
    // rotation) must produce exactly one translate (layout + positionOffset) and
    // NO rotate/scale/pivot translates — byte-identical to the original painter.
    const rc = makeRecordingContext();
    const segment = makeSegment({
      width: WIDTH,
      layoutX: 5,
      layoutY: 7,
      effectOverrides: { opacity: 0.5, positionOffset: [3, 4], blur: 2, color: "#112233" },
    });
    const state = makeState({
      layers: [makeLayerState({ fontSize: FONT_SIZE, segments: [segment] })],
    });

    drawFrame(rc.ctx, state);

    // Segment-level transform ops: exactly one translate to (layoutX+off, layoutY+off),
    // no rotate, no scale, and therefore no pivot translate pair.
    // (The layer-level translate to the anchor is the first translate.)
    const translates = rc.args.translate;
    // layer anchor translate (0,0) then the single segment translate (8, 11).
    expect(translates).toContainEqual([8, 11]);
    expect(rc.args.rotate).toHaveLength(0);
    expect(rc.args.scale).toHaveLength(0);
    // No extra pivot translate pair: with a (0,0) anchor the only translates are
    // the anchor and the one segment translate.
    expect(translates).toHaveLength(2);
    expectBalancedSaveRestore(rc.calls);
  });
});
