/**
 * Unit + property tests for the `wave` effect (looping).
 *
 * Properties: 1 (determinism), 2 (bounded — each axis within [-32000, 32000]),
 * 4 (loop period: positionOffset(t) == positionOffset(t + period)). Looping ⇒
 * no terminal-identity property. Unit tests sample the oscillation on each axis
 * and pin the throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbWaveParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("wave")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { periodSeconds: 1, amplitude: 10, axis: "y" as const, phasePerGroup: 0 };

describe("wave — unit", () => {
  const e = def();

  it("t=0, group 0 → zero offset (sin 0 = 0)", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D }));
    expect(ov.positionOffset![1]).toBeCloseTo(0, 10);
  });

  it("quarter period → peak amplitude on the y axis", () => {
    // theta = 2π * 0.25 = π/2 → sin = 1 → m = amplitude.
    const ov = e.applyEffect(makeArgs({ t: 0.25, params: D }));
    expect(ov.positionOffset![1]).toBeCloseTo(10, 10);
    expect(ov.positionOffset![0]).toBe(0);
  });

  it("axis = x places the oscillation on the x axis", () => {
    const ov = e.applyEffect(makeArgs({ t: 0.25, params: { ...D, axis: "x" } }));
    expect(ov.positionOffset![0]).toBeCloseTo(10, 10);
    expect(ov.positionOffset![1]).toBe(0);
  });

  it("throws InvalidEffectParamsError on bad params (amplitude = 99999)", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, amplitude: 99999 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("wave — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbWaveParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (each axis within [-32000, 32000])", () => {
    fc.assert(
      fc.property(arbWaveParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        const [ox, oy] = ov.positionOffset!;
        expect(Number.isFinite(ox)).toBe(true);
        expect(Number.isFinite(oy)).toBe(true);
        expect(Math.abs(ox)).toBeLessThanOrEqual(32000);
        expect(Math.abs(oy)).toBeLessThanOrEqual(32000);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 4: loop period — positionOffset(t) == positionOffset(t + period)", () => {
    fc.assert(
      // Keep t modest so t/period and (t+period)/period differ by exactly 1 and
      // theta advances by exactly 2π; sin is 2π-periodic so the offset repeats.
      fc.property(arbWaveParams, fc.double({ min: 0, max: 20, noNaN: true }), fc.nat(20), (params, t, gi) => {
        const a = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 1 }));
        const b = e.applyEffect(makeArgs({ params, t: t + params.periodSeconds, groupIndex: gi, groupCount: gi + 1 }));
        const [ax, ay] = a.positionOffset!;
        const [bx, by] = b.positionOffset!;
        // sin(theta + 2π) == sin(theta) mathematically; allow tiny FP slack.
        expect(bx).toBeCloseTo(ax, 6);
        expect(by).toBeCloseTo(ay, 6);
      }),
      { numRuns: 300 },
    );
  });
});
