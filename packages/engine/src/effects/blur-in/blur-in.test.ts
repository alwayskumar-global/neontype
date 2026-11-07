/**
 * Unit + property tests for the `blur-in` effect.
 *
 * Unit tests pin the start (p=0), completion (p=1), and midpoint (p=0.5)
 * behaviour and the invalid-params throw. Property tests (fast-check, 100+ runs)
 * cover determinism (Property 1), bounded output (Property 2), and terminal
 * identity at p=1 (Property 3), using `arbBlurInParams`.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbBlurInParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";
import { createRegistry } from "../../registry.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("blur-in")!;
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

const D = { startDelay: 0, durationSeconds: 1, startBlur: 10, delayPerGroup: 0, easing: "linear" as const };

describe("blur-in — unit", () => {
  const e = def();

  it("p=0 → opacity 0, blur = startBlur", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.opacity).toBe(0);
    expect(ov.blur).toBe(10);
  });

  it("p=1 → opacity 1, blur 0 (identity)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D }));
    expect(ov.opacity).toBe(1);
    expect(ov.blur).toBe(0);
  });

  it("p=0.5 (linear) → opacity 0.5, blur 5", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D }));
    expect(ov.opacity).toBeCloseTo(0.5, 10);
    expect(ov.blur).toBeCloseTo(5, 10);
  });

  it("throws InvalidEffectParamsError on bad params", () => {
    expect(() => e.applyEffect(makeArgs({ params: { durationSeconds: -1 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("blur-in — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbBlurInParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(50), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output", () => {
    fc.assert(
      fc.property(arbBlurInParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(50), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(Number.isFinite(ov.opacity!)).toBe(true);
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
        expect(Number.isFinite(ov.blur!)).toBe(true);
        expect(ov.blur!).toBeGreaterThanOrEqual(0);
        expect(ov.blur!).toBeLessThanOrEqual(1000);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 3: terminal identity at p=1", () => {
    fc.assert(
      fc.property(arbBlurInParams, fc.nat(50), (params, gi) => {
        // Drive progress past completion so clamp() pins p to exactly 1
        // regardless of FP cancellation: add a full extra second beyond the
        // completion threshold so the raw quotient is comfortably >= 1.
        const t = params.startDelay + gi * params.delayPerGroup + params.durationSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity).toBe(1);
        expect(ov.blur).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
