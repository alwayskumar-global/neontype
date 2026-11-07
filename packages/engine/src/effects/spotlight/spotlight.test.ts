/**
 * Unit + property tests for the `spotlight` effect.
 *
 * Properties: 1 (determinism), 2 (bounded — opacity in [dimOpacity, 1] ⊂
 * [0,1]), 3 (terminal identity under settleAtEnd=true). Unit tests pin the
 * focus sweep, groupCount=1, both settleAtEnd values, and the throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbSpotlightParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("spotlight")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, durationSeconds: 1, radius: 0, dimOpacity: 0.1, settleAtEnd: true };

describe("spotlight — unit", () => {
  const e = def();

  it("s=0 → focus at group 0: group 0 bright, far groups dim", () => {
    const g0 = e.applyEffect(makeArgs({ t: 0, params: D, groupIndex: 0, groupCount: 5 }));
    const g4 = e.applyEffect(makeArgs({ t: 0, params: D, groupIndex: 4, groupCount: 5 }));
    expect(g0.opacity).toBe(1);
    expect(g4.opacity!).toBeLessThan(1);
    expect(g4.opacity!).toBeGreaterThanOrEqual(D.dimOpacity);
  });

  it("s=0.5 → focus at the middle group", () => {
    // f = 0.5 * 4 = 2 → group 2 bright.
    const g2 = e.applyEffect(makeArgs({ t: 0.5, params: D, groupIndex: 2, groupCount: 5 }));
    expect(g2.opacity).toBe(1);
  });

  it("groupCount = 1 → opacity 1", () => {
    const ov = e.applyEffect(makeArgs({ t: 0, params: D, groupIndex: 0, groupCount: 1 }));
    expect(ov.opacity).toBe(1);
  });

  it("settleAtEnd = true → every group opacity 1 after the sweep (s >= 1)", () => {
    for (let gi = 0; gi < 5; gi++) {
      const ov = e.applyEffect(makeArgs({ t: 2, params: D, groupIndex: gi, groupCount: 5 }));
      expect(ov.opacity).toBe(1);
    }
  });

  it("settleAtEnd = false → groups outside focus stay dim after the sweep", () => {
    // s >= 1 → f = groupCount-1 = 4 (focus at last group); group 0 is far → dim.
    const ov = e.applyEffect(makeArgs({ t: 2, params: { ...D, settleAtEnd: false }, groupIndex: 0, groupCount: 5 }));
    expect(ov.opacity!).toBeLessThan(1);
    expect(ov.opacity!).toBeGreaterThanOrEqual(D.dimOpacity);
  });

  it("throws InvalidEffectParamsError on bad params (dimOpacity = 2)", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, dimOpacity: 2 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("spotlight — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbSpotlightParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const count = gi + 2;
        const a = makeArgs({ params, t, groupIndex: gi % count, groupCount: count });
        const b = makeArgs({ params, t, groupIndex: gi % count, groupCount: count });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (opacity in [dimOpacity, 1] ⊂ [0,1])", () => {
    fc.assert(
      fc.property(arbSpotlightParams, fc.double({ min: 0, max: 120, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const count = gi + 2;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi % count, groupCount: count }));
        expect(Number.isFinite(ov.opacity!)).toBe(true);
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
        // When dimmed, never below dimOpacity.
        expect(ov.opacity!).toBeGreaterThanOrEqual(Math.min(params.dimOpacity, 1) - 1e-12);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 3: terminal identity under settleAtEnd=true (all groups opacity 1 after sweep)", () => {
    fc.assert(
      fc.property(arbSpotlightParams, fc.nat(40), (params, gi) => {
        const count = gi + 2;
        const t = params.startDelay + params.durationSeconds + 1; // s >= 1
        const ov = e.applyEffect(makeArgs({ params: { ...params, settleAtEnd: true }, t, groupIndex: gi % count, groupCount: count }));
        expect(ov.opacity).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
