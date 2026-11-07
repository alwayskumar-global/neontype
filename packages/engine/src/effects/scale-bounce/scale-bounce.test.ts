/**
 * Unit + property tests for the `scale-bounce` effect.
 *
 * Properties: 1 (determinism), 2 (bounded), 3 (terminal identity at p=1), and 7
 * (terminal scale exactly 1; bounces=0 never exceeds 1; for startScale=0,
 * bounces in 1..10 the number of p-intervals where scale > 1 equals `bounces`
 * and successive extremum deviations from 1 strictly decrease). Unit tests pin
 * p=0 / p=1 / p=0.5, the bounces=0 monotone branch, and the throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbScaleBounceParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("scale-bounce")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, startScale: 0, bounces: 2 };

/** Samples scale over p in [0,1) at fine resolution (duration 1, no delay). */
function scaleSamples(e: ReturnType<typeof def>, params: Record<string, unknown>, n = 4001): { p: number; s: number }[] {
  const out: { p: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    out.push({ p, s: e.applyEffect(makeArgs({ t: p, params })).scale! });
  }
  return out;
}

/** Counts maximal contiguous p-intervals where scale > 1 + eps. */
function countOvershootIntervals(samples: { p: number; s: number }[], eps = 1e-9): number {
  let count = 0;
  let inside = false;
  for (const { s } of samples) {
    if (s > 1 + eps) {
      if (!inside) count++;
      inside = true;
    } else {
      inside = false;
    }
  }
  return count;
}

/** Peak |scale - 1| deviation within each overshoot interval (above 1). */
function overshootPeaks(samples: { p: number; s: number }[], eps = 1e-9): number[] {
  const peaks: number[] = [];
  let inside = false;
  let cur = 0;
  for (const { s } of samples) {
    if (s > 1 + eps) {
      if (!inside) { cur = 0; inside = true; }
      cur = Math.max(cur, s - 1);
    } else {
      if (inside) peaks.push(cur);
      inside = false;
    }
  }
  if (inside) peaks.push(cur);
  return peaks;
}

describe("scale-bounce — unit", () => {
  const e = def();

  it("p=0 → scale = startScale, opacity 0", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.scale).toBe(0);
    expect(ov.opacity).toBe(0);
  });

  it("p=1 → opacity 1, scale exactly 1 (identity)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D }));
    expect(ov.opacity).toBe(1);
    expect(ov.scale).toBe(1);
  });

  it("p=0.5 → finite scale within [0,100], opacity 1 (past epsilon)", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D }));
    expect(Number.isFinite(ov.scale!)).toBe(true);
    expect(ov.opacity).toBe(1);
  });

  it("bounces = 0 → monotone rise to 1, never exceeds 1", () => {
    const samples = scaleSamples(e, { ...D, bounces: 0, startScale: 0.3 });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].s).toBeGreaterThanOrEqual(samples[i - 1].s - 1e-12); // non-decreasing
      expect(samples[i].s).toBeLessThanOrEqual(1 + 1e-9); // no overshoot above 1
    }
    expect(e.applyEffect(makeArgs({ t: 1, params: { ...D, bounces: 0, startScale: 0.3 } })).scale).toBe(1);
  });

  it("opacity reaches exactly 1 at p = epsilon (0.05)", () => {
    expect(e.applyEffect(makeArgs({ t: 0.05, params: D })).opacity).toBe(1);
    expect(e.applyEffect(makeArgs({ t: 0.025, params: D })).opacity).toBeCloseTo(0.5, 10);
  });

  it("throws InvalidEffectParamsError on bad params (bounces = 20)", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, bounces: 20 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("scale-bounce — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbScaleBounceParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output", () => {
    fc.assert(
      fc.property(arbScaleBounceParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
        expect(Number.isFinite(ov.scale!)).toBe(true);
        expect(ov.scale!).toBeGreaterThanOrEqual(0);
        expect(ov.scale!).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 3: terminal identity at p=1 (scale exactly 1)", () => {
    fc.assert(
      fc.property(arbScaleBounceParams, fc.nat(40), (params, gi) => {
        const t = params.startDelay + gi * params.delayPerGroup + params.durationSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity).toBe(1);
        expect(ov.scale).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 7: for startScale=0, overshoot-interval count == bounces and peaks strictly decrease", () => {
    for (let bounces = 1; bounces <= 10; bounces++) {
      const samples = scaleSamples(e, { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, startScale: 0, bounces }, 20001);
      const count = countOvershootIntervals(samples);
      expect(count).toBe(bounces);
      const peaks = overshootPeaks(samples);
      expect(peaks.length).toBe(bounces);
      for (let i = 1; i < peaks.length; i++) {
        expect(peaks[i]).toBeLessThan(peaks[i - 1]);
      }
    }
  });
});
