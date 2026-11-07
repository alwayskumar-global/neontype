/**
 * Unit + property tests for the `glitch-reveal` effect.
 *
 * Properties: 1 (determinism), 2 (bounded — each axis within [-maxOffset,
 * maxOffset]), 3 (terminal identity at p=1), and 5 (jitter differs across
 * distinct step indices). Unit tests pin p=0/p=1/p=0.5, the magnitude==0
 * zero-draw boundary, and the invalid-params throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbGlitchRevealParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("glitch-reveal")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a",
    charIndex: 0,
    wordIndex: 0,
    lineIndex: 0,
    groupIndex: 0,
    groupCount: 1,
    t: 0,
    params: {},
    prng: createPRNG(1),
    ...over,
  };
}

const D = {
  startDelay: 0,
  durationSeconds: 1,
  delayPerGroup: 0,
  maxOffset: 100,
  steps: 8,
  easing: "linear" as const,
};

describe("glitch-reveal — unit", () => {
  const e = def();

  it("p=0 → opacity 0 and a jittered offset within [-maxOffset, maxOffset]", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.opacity).toBe(0);
    expect(Math.abs(ov.positionOffset![0])).toBeLessThanOrEqual(100);
    expect(Math.abs(ov.positionOffset![1])).toBeLessThanOrEqual(100);
  });

  it("p=1 → opacity 1, positionOffset [0,0] (identity, magnitude 0)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D }));
    expect(ov.opacity).toBe(1);
    expect(ov.positionOffset).toEqual([0, 0]);
  });

  it("p=0.5 → opacity 0.5, offset within half magnitude", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D }));
    expect(ov.opacity).toBeCloseTo(0.5, 10);
    // magnitude = 100 * (1 - 0.5) = 50
    expect(Math.abs(ov.positionOffset![0])).toBeLessThanOrEqual(50);
    expect(Math.abs(ov.positionOffset![1])).toBeLessThanOrEqual(50);
  });

  it("magnitude == 0 (maxOffset 0) → [0,0] and draws zero PRNG values", () => {
    let draws = 0;
    const countingPrng = { next: () => { draws++; return 0.5; } };
    const ov = e.applyEffect(makeArgs({ t: 0, params: { ...D, maxOffset: 0 }, prng: countingPrng }));
    expect(ov.positionOffset).toEqual([0, 0]);
    expect(draws).toBe(0);
  });

  it("throws InvalidEffectParamsError on bad params (steps = 0)", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, steps: 0 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("glitch-reveal — properties", () => {
  const e = def();
  const seededArgs = (params: unknown, t: number, gi: number): ApplyEffectArgs =>
    makeArgs({ params: params as Record<string, unknown>, t, groupIndex: gi, groupCount: gi + 1, prng: createPRNG(12345 + gi) });

  it("Property 1: determinism (same inputs incl. identically-seeded prng)", () => {
    fc.assert(
      fc.property(arbGlitchRevealParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        expect(e.applyEffect(seededArgs(params, t, gi))).toEqual(e.applyEffect(seededArgs(params, t, gi)));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (axes within [-maxOffset, maxOffset], opacity [0,1])", () => {
    fc.assert(
      fc.property(arbGlitchRevealParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const ov = e.applyEffect(seededArgs(params, t, gi));
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
        const [ox, oy] = ov.positionOffset!;
        expect(Number.isFinite(ox)).toBe(true);
        expect(Number.isFinite(oy)).toBe(true);
        expect(Math.abs(ox)).toBeLessThanOrEqual(params.maxOffset + 1e-9);
        expect(Math.abs(oy)).toBeLessThanOrEqual(params.maxOffset + 1e-9);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 3: terminal identity at p=1", () => {
    fc.assert(
      fc.property(arbGlitchRevealParams, fc.nat(40), (params, gi) => {
        const t = params.startDelay + gi * params.delayPerGroup + params.durationSeconds + 1;
        const ov = e.applyEffect(seededArgs(params, t, gi));
        expect(ov.opacity).toBe(1);
        expect(ov.positionOffset).toEqual([0, 0]);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 5: jitter differs across distinct step indices for some input", () => {
    // Fixed params/seed; sample p-values in different step cells and confirm the
    // offset is not constant across all of them.
    const params = { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, maxOffset: 100, steps: 8, easing: "linear" as const };
    const offsets = [];
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8; // center of each step cell, p in (0,1)
      const ov = e.applyEffect(makeArgs({ params, t, prng: createPRNG(777) }));
      offsets.push(JSON.stringify(ov.positionOffset));
    }
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });
});
