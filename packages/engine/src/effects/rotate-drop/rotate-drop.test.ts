/**
 * Unit + property tests for the `rotate-drop` effect.
 *
 * Properties: 1 (determinism), 2 (bounded), 3 (terminal identity at p=1). Unit
 * tests pin p=0 / p=1 / p=0.5 and the invalid-params throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbRotateDropParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("rotate-drop")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, durationSeconds: 1, delayPerGroup: 0, dropDistance: -100, startRotation: -90, easing: "linear" as const };

describe("rotate-drop — unit", () => {
  const e = def();

  it("p=0 → opacity 0, [0, dropDistance], rotation startRotation", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.opacity).toBe(0);
    expect(ov.positionOffset).toEqual([0, -100]);
    expect(ov.rotation).toBe(-90);
  });

  it("p=1 → opacity 1, [0,0], rotation 0 (identity)", () => {
    const ov = e.applyEffect(makeArgs({ t: 1, params: D }));
    expect(ov.opacity).toBe(1);
    expect(ov.positionOffset).toEqual([0, 0]);
    expect(ov.rotation).toBe(0);
  });

  it("p=0.5 (linear) → halfway", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.5, params: D }));
    expect(ov.opacity).toBeCloseTo(0.5, 10);
    expect(ov.positionOffset![1]).toBeCloseTo(-50, 10);
    expect(ov.rotation).toBeCloseTo(-45, 10);
  });

  it("throws InvalidEffectParamsError on bad params", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, startRotation: 99999 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("rotate-drop — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbRotateDropParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output", () => {
    fc.assert(
      fc.property(arbRotateDropParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
        const [ox, oy] = ov.positionOffset!;
        expect(Math.abs(ox)).toBeLessThanOrEqual(32000);
        expect(Math.abs(oy)).toBeLessThanOrEqual(32000);
        expect(Math.abs(ov.rotation!)).toBeLessThanOrEqual(36000);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 3: terminal identity at p=1", () => {
    fc.assert(
      fc.property(arbRotateDropParams, fc.nat(40), (params, gi) => {
        const t = params.startDelay + gi * params.delayPerGroup + params.durationSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        expect(ov.opacity).toBe(1);
        expect(ov.positionOffset).toEqual([0, 0]);
        expect(ov.rotation).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
