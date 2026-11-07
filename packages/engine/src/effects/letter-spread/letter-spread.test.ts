/**
 * Unit + property tests for the `letter-spread` effect.
 *
 * Properties: 1 (determinism), 2 (bounded), 3 (terminal identity at p=1). Unit
 * tests pin p=0 (fully spread), p=1 ([0,0]), p=0.5, the groupCount=1 boundary,
 * both axes, and the invalid-params throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbLetterSpreadParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("letter-spread")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, durationSeconds: 1, spreadDistance: 10, axis: "x" as const, easing: "linear" as const };

describe("letter-spread — unit", () => {
  const e = def();

  it("p=0 → fully-spread offset m = (gi - (n-1)/2) * spreadDistance", () => {
    // groupIndex 0 of 5 → (0 - 2) * 10 = -20
    const ov = e.applyEffect(makeArgs({ t: 0, params: D, groupIndex: 0, groupCount: 5 }));
    expect(ov.positionOffset).toEqual([-20, 0]);
  });

  it("p=1 → [0,0] (identity)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D, groupIndex: 0, groupCount: 5 }));
    expect(ov.positionOffset).toEqual([0, 0]);
  });

  it("p=0.5 (linear) → half of fully-spread", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D, groupIndex: 4, groupCount: 5 }));
    // (4 - 2) * 10 * (1 - 0.5) = 10
    expect(ov.positionOffset![0]).toBeCloseTo(10, 10);
    expect(ov.positionOffset![1]).toBe(0);
  });

  it("groupCount = 1 → [0,0]", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D, groupIndex: 0, groupCount: 1 }));
    expect(ov.positionOffset).toEqual([0, 0]);
  });

  it("axis = y places the offset on the y axis", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: { ...D, axis: "y" }, groupIndex: 0, groupCount: 5 }));
    expect(ov.positionOffset).toEqual([0, -20]);
  });

  it("throws InvalidEffectParamsError on bad params", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, spreadDistance: 999999 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("letter-spread — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbLetterSpreadParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (each axis within [-32000, 32000])", () => {
    fc.assert(
      fc.property(arbLetterSpreadParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(60), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 }));
        const [ox, oy] = ov.positionOffset!;
        expect(Number.isFinite(ox)).toBe(true);
        expect(Number.isFinite(oy)).toBe(true);
        expect(Math.abs(ox)).toBeLessThanOrEqual(32000);
        expect(Math.abs(oy)).toBeLessThanOrEqual(32000);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 3: terminal identity at p=1", () => {
    fc.assert(
      fc.property(arbLetterSpreadParams, fc.nat(40), (params, gi) => {
        const t = params.startDelay + params.durationSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 }));
        expect(ov.positionOffset).toEqual([0, 0]);
      }),
      { numRuns: 200 },
    );
  });
});
