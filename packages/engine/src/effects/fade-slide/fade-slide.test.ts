import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { InvalidEffectParamsError } from "../../errors.js";
import {
  createRegistry,
  type ApplyEffectArgs,
  type EffectDefinition,
} from "../../registry.js";
import { arbFadeSlideParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

/** Registers `fade-slide` into a fresh registry and returns its definition. */
function getFadeSlide(): EffectDefinition {
  const registry = createRegistry();
  register(registry);
  const def = registry.get("fade-slide");
  if (!def) throw new Error("fade-slide not registered");
  return def;
}

/** Builds `ApplyEffectArgs` with sensible defaults, overridable per test. */
function makeArgs(overrides: Partial<ApplyEffectArgs>): ApplyEffectArgs {
  return {
    groupText: "a",
    charIndex: 0,
    wordIndex: 0,
    lineIndex: 0,
    groupIndex: 0,
    groupCount: 1,
    t: 0,
    params: {},
    prng: { next: () => 0 },
    ...overrides,
  };
}

describe("fade-slide effect", () => {
  const linearX = {
    durationSeconds: 2,
    slideDistance: 100,
    slideAxis: "x",
    delayPerSegment: 0,
    easing: "linear",
  };

  it("registers under the id 'fade-slide'", () => {
    const def = getFadeSlide();
    expect(def.id).toBe("fade-slide");
  });

  it("p=0: full offset and opacity 0 (x-axis)", () => {
    const def = getFadeSlide();
    // tLocal=0, delayPerSegment=0 => rawP = 0/2 = 0 => eased 0.
    const out = def.applyEffect(
      makeArgs({ params: linearX, groupIndex: 0, t: 0 }),
    );
    expect(out.opacity).toBe(0);
    expect(out.positionOffset).toEqual([100, 0]);
  });

  it("p=1: zero offset and opacity exactly 1 (x-axis)", () => {
    const def = getFadeSlide();
    // tLocal >= duration => rawP >= 1 => clamp 1 => eased exactly 1.
    const out = def.applyEffect(
      makeArgs({ params: linearX, groupIndex: 0, t: 5 }),
    );
    expect(out.opacity).toBe(1);
    expect(out.positionOffset).toEqual([0, 0]);
  });

  it("p=0: full offset on the y-axis when slideAxis is 'y'", () => {
    const def = getFadeSlide();
    const linearY = { ...linearX, slideAxis: "y", slideDistance: 80 };
    const out = def.applyEffect(
      makeArgs({ params: linearY, groupIndex: 0, t: 0 }),
    );
    expect(out.opacity).toBe(0);
    expect(out.positionOffset).toEqual([0, 80]);
  });

  it("p=0.5 (linear): opacity 0.5 and half offset", () => {
    const def = getFadeSlide();
    // tLocal=1, duration=2, delay=0 => rawP = 1/2 = 0.5 => linear eased 0.5.
    const out = def.applyEffect(
      makeArgs({ params: linearX, groupIndex: 0, t: 1 }),
    );
    expect(out.opacity).toBeCloseTo(0.5, 10);
    const [ox, oy] = out.positionOffset ?? [NaN, NaN];
    expect(ox).toBeCloseTo(50, 10);
    expect(oy).toBe(0);
  });

  it("applies the per-segment delay before computing progress", () => {
    const def = getFadeSlide();
    // groupIndex 2, delayPerSegment 1 => start at t=2; duration 2 => p=1 at t=4.
    const delayed = { ...linearX, delayPerSegment: 1 };
    const atStart = def.applyEffect(
      makeArgs({ params: delayed, groupIndex: 2, t: 2 }),
    );
    expect(atStart.opacity).toBe(0);
    expect(atStart.positionOffset).toEqual([100, 0]);

    const atEnd = def.applyEffect(
      makeArgs({ params: delayed, groupIndex: 2, t: 4 }),
    );
    expect(atEnd.opacity).toBe(1);
    expect(atEnd.positionOffset).toEqual([0, 0]);
  });

  it("supports a negative slideDistance (full offset at p=0)", () => {
    const def = getFadeSlide();
    const negative = { ...linearX, slideDistance: -40 };
    const out = def.applyEffect(
      makeArgs({ params: negative, groupIndex: 0, t: 0 }),
    );
    expect(out.positionOffset).toEqual([-40, 0]);
  });

  it("throws InvalidEffectParamsError for a non-positive durationSeconds", () => {
    const def = getFadeSlide();
    expect(() =>
      def.applyEffect(makeArgs({ params: { ...linearX, durationSeconds: 0 } })),
    ).toThrow(InvalidEffectParamsError);
  });

  it("throws InvalidEffectParamsError for an invalid slideAxis", () => {
    const def = getFadeSlide();
    expect(() =>
      def.applyEffect(makeArgs({ params: { ...linearX, slideAxis: "z" } })),
    ).toThrow(InvalidEffectParamsError);
  });

  it("throws InvalidEffectParamsError when easing is missing", () => {
    const def = getFadeSlide();
    const withoutEasing = {
      durationSeconds: 2,
      slideDistance: 100,
      slideAxis: "x",
      delayPerSegment: 0,
    };
    expect(() =>
      def.applyEffect(makeArgs({ params: withoutEasing })),
    ).toThrow(InvalidEffectParamsError);
  });

  // Feature: engine-core, Property 15: Fade-slide boundary condition
  //
  // At the completion point `tLocal = groupIndex * delayPerSegment +
  // durationSeconds`, raw progress is `(tLocal - groupIndex * delayPerSegment) /
  // durationSeconds`, which is exactly `1` because `arbFadeSlideParams` draws
  // INTEGER timings (so the sum and difference are exact with a small
  // groupIndex). The effect clamps to `[0, 1]`, and every easing variant returns
  // exactly its `b` boundary at `p = 1`, so `eased === 1`: opacity is exactly
  // `1` and the offset is `slideDistance * (1 - 1) = 0` on both axes → `[0, 0]`.
  it("Property 15: at the completion point opacity is exactly 1 and offset [0, 0]", () => {
    const def = getFadeSlide();
    // At the completion point the offset magnitude is
    // `slideDistance * (1 - eased) = slideDistance * 0`, which evaluates to `-0`
    // for a negative `slideDistance`. `-0` is numerically zero, and
    // `computeFrameState` normalizes `-0 → +0` downstream (design Step 5), so the
    // property normalizes the sign of zero before the exact `[0, 0]` comparison.
    // This keeps negative `slideDistance` in the generator's coverage without a
    // false signed-zero failure. Opacity stays an exact `1` check.
    const norm = (n: number): number => (n === 0 ? 0 : n); // maps -0 and +0 to +0
    fc.assert(
      fc.property(arbFadeSlideParams, fc.nat({ max: 1000 }), (params, groupIndex) => {
        const tLocal = groupIndex * params.delayPerSegment + params.durationSeconds;
        const out = def.applyEffect(
          makeArgs({
            params,
            groupIndex,
            groupCount: groupIndex + 1,
            t: tLocal,
          }),
        );
        expect(out.opacity).toBe(1);
        const [ox, oy] = out.positionOffset ?? [NaN, NaN];
        expect([norm(ox), norm(oy)]).toEqual([0, 0]);
      }),
    );
  });
});
