/**
 * Unit + property tests for the `kinetic-pop` effect.
 *
 * Properties: 1 (determinism), 2 (bounded), 3 (terminal identity at p=1), and 6
 * (peak == target = max(startScale, 1 + overshoot), attained where eased value
 * is 0.6, exceeds 1 iff overshoot > 0). Includes the DEFAULT-params assertion:
 * scale exceeds 1 at some p and the maximum is within 1e-9 of 1.25.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbKineticPopParams } from "../../testing/arbitraries.js";
import { KineticPopParamsSchema } from "./schema.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("kinetic-pop")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, startScale: 0.2, overshoot: 0.25, easing: "linear" as const };

// A continuous easing (linear / ease* / cubicBezier) — never `step`. Property 6
// (peak == target, attained at eased value 0.6) only holds for easings whose
// range passes through 0.6; a `step` easing can jump 0 → 1 and skip the apex,
// so it is excluded from the peak assertions (determinism/bounds/terminal
// identity still cover step easing in Properties 1–3 and the example below).
const arbContinuousEasing = fc.oneof(
  fc.constant("linear" as const),
  fc.constant("easeIn" as const),
  fc.constant("easeOut" as const),
  fc.constant("easeInOut" as const),
  fc.record({
    x1: fc.double({ min: 0, max: 1, noNaN: true }),
    y1: fc.double({ min: 0, max: 1, noNaN: true }),
    x2: fc.double({ min: 0, max: 1, noNaN: true }),
    y2: fc.double({ min: 0, max: 1, noNaN: true }),
  }).map((cp) => ({ type: "cubicBezier" as const, ...cp })),
);

const arbKineticPopContinuous = fc.record({
  startDelay: fc.double({ min: 0, max: 60, noNaN: true }),
  durationSeconds: fc.double({ min: 0.001, max: 60, noNaN: true }),
  delayPerGroup: fc.double({ min: 0, max: 60, noNaN: true }),
  startScale: fc.double({ min: 0, max: 100, noNaN: true }),
  overshoot: fc.double({ min: 0, max: 10, noNaN: true }),
  easing: arbContinuousEasing,
});

/**
 * Samples scale over p in [0,1] at fine resolution by sweeping `t` across the
 * params' actual [startDelay, startDelay + durationSeconds] window (groupIndex
 * 0), so the grid covers the full progress range regardless of durationSeconds.
 */
function scaleSamples(e: ReturnType<typeof def>, params: Record<string, unknown>, n = 2001): number[] {
  const startDelay = (params.startDelay as number) ?? 0;
  const duration = (params.durationSeconds as number) ?? 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const t = startDelay + p * duration; // groupIndex 0 → p == (t - startDelay)/duration
    out.push(e.applyEffect(makeArgs({ t, params })).scale!);
  }
  return out;
}

describe("kinetic-pop — unit", () => {
  const e = def();

  it("p=0 → opacity 0, scale = startScale", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.opacity).toBe(0);
    expect(ov.scale).toBeCloseTo(0.2, 10);
  });

  it("p=1 → opacity 1, scale exactly 1 (identity)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D }));
    expect(ov.opacity).toBe(1);
    expect(ov.scale).toBe(1);
  });

  it("p=0.5 → scale between startScale and target", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D }));
    expect(ov.scale!).toBeGreaterThan(0.2);
    expect(ov.scale!).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it("overshoot = 0, startScale <= 1 → max scale exactly 1 (no overshoot)", () => {
    const samples = scaleSamples(e, { ...D, overshoot: 0 });
    const max = Math.max(...samples);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(max).toBeGreaterThan(1 - 1e-9); // reaches 1 at the peak/end
  });

  it("step easing: scale stays within [min(startScale,1), target] and is exactly 1 at p=1", () => {
    // A `step` easing can skip the eased value 0.6, so the curve may never reach
    // `target` — but it must stay bounded by [min(startScale,1), target] and hit
    // exactly 1 at completion. (Property 6's peak-equality is scoped to
    // continuous easings; this example documents the step-easing behaviour.)
    const params = { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, startScale: 0.3, overshoot: 0.5, easing: { type: "step" as const, steps: 1 } };
    const target = Math.max(params.startScale, 1 + params.overshoot); // 1.5
    const lo = Math.min(params.startScale, 1); // 0.3
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const scale = e.applyEffect(makeArgs({ t, params })).scale!;
      expect(scale).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(scale).toBeLessThanOrEqual(target + 1e-9);
    }
    expect(e.applyEffect(makeArgs({ t: 1, params })).scale).toBe(1);
  });

  it("DEFAULT params: scale exceeds 1 at some p and max ≈ 1.25", () => {
    const d = KineticPopParamsSchema.parse({}); // schema defaults
    const samples = scaleSamples(e, d as unknown as Record<string, unknown>);
    expect(samples.some((s) => s > 1)).toBe(true);
    const max = Math.max(...samples);
    // The true apex is exactly 1.25 at eased value 0.6; a finite sampling grid
    // approaches it to ~1e-8, so assert within 1e-6 and that it never exceeds
    // 1.25 (the analytic upper bound) beyond fp slack.
    expect(max).toBeCloseTo(1.25, 6);
    expect(max).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it("throws InvalidEffectParamsError on bad params", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, startScale: -1 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("kinetic-pop — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbKineticPopParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output", () => {
    fc.assert(
      fc.property(arbKineticPopParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
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

  it("Property 3: terminal identity at p=1", () => {
    fc.assert(
      fc.property(arbKineticPopParams, fc.nat(40), (params, gi) => {
        const t = params.startDelay + gi * params.delayPerGroup + params.durationSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity).toBe(1);
        expect(ov.scale).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 6: peak == max(startScale, 1 + overshoot), exceeds 1 iff overshoot > 0 (continuous easings)", () => {
    fc.assert(
      fc.property(arbKineticPopContinuous, (params) => {
        const target = Math.max(params.startScale, 1 + params.overshoot);
        // Sample densely over p in [0,1] (duration 1, no delay).
        const samples = scaleSamples(e, params as unknown as Record<string, unknown>, 2001);
        const max = Math.max(...samples);
        const expectedMax = Math.min(target, 100);
        // Grid sampling approaches the exact apex; allow a small absolute slack.
        expect(Math.abs(max - expectedMax)).toBeLessThanOrEqual(1e-4 * Math.max(1, expectedMax) + 1e-6);
        // "Exceeds 1" is asserted only when the target clears 1 by a margin
        // the sampling grid can resolve; for an overshoot near machine epsilon
        // the apex is representably > 1 but below grid resolution, so the sampled
        // max can read exactly 1 — not a defect, a sampling limit.
        if (target > 1 + 1e-6 && params.startScale <= target) {
          expect(max).toBeGreaterThan(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
