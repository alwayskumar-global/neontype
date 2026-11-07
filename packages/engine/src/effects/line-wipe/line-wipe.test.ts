/**
 * Unit + property tests for the `line-wipe` effect.
 *
 * Properties: 1 (determinism), 2 (bounded), 3 (terminal identity at completion).
 * Unit tests pin before-threshold / at-completion / mid-fade, the fadeSeconds=0
 * hard-step boundary, both directions, and the invalid-params throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbLineWipeParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("line-wipe")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { startDelay: 0, delayPerGroup: 0.1, fadeSeconds: 0.2, direction: "forward" as const, easing: "linear" as const };

describe("line-wipe — unit", () => {
  const e = def();

  it("before threshold → opacity 0", () => {
    // group 3 forward: threshold = 0.3; t = 0.1 < 0.3.
    const ov = e.applyEffect(makeArgs({ t: 0.1, params: D, groupIndex: 3, groupCount: 5 }));
    expect(ov.opacity).toBe(0);
  });

  it("at/after threshold + fadeSeconds → opacity exactly 1 (identity)", () => {
    // group 3 forward: threshold 0.3, +fade 0.2 = completion 0.5. Use t = 1.0
    // (strictly past completion) so the fade fraction clamps to exactly 1 and
    // avoids the FP knife-edge where 3 * 0.1 != 0.3 exactly.
    const ov = e.applyEffect(makeArgs({ t: 1.0, params: D, groupIndex: 3, groupCount: 5 }));
    expect(ov.opacity).toBe(1);
  });

  it("mid-fade (linear) → partial opacity", () => {
    // group 0 forward: threshold 0; t = 0.1, fade 0.2 → q = 0.5 → opacity 0.5.
    const ov = e.applyEffect(makeArgs({ t: 0.1, params: D, groupIndex: 0, groupCount: 5 }));
    expect(ov.opacity).toBeCloseTo(0.5, 10);
  });

  it("fadeSeconds = 0 → hard step 0/1 at threshold", () => {
    const params = { ...D, fadeSeconds: 0 };
    // group 2 forward threshold = 0.2.
    expect(e.applyEffect(makeArgs({ t: 0.19, params, groupIndex: 2, groupCount: 5 })).opacity).toBe(0);
    expect(e.applyEffect(makeArgs({ t: 0.2, params, groupIndex: 2, groupCount: 5 })).opacity).toBe(1);
  });

  it("backward direction reverses the threshold order", () => {
    // group 0 backward of 5: threshold = (5-1-0)*0.1 = 0.4.
    expect(e.applyEffect(makeArgs({ t: 0.39, params: { ...D, direction: "backward", fadeSeconds: 0 }, groupIndex: 0, groupCount: 5 })).opacity).toBe(0);
    expect(e.applyEffect(makeArgs({ t: 0.4, params: { ...D, direction: "backward", fadeSeconds: 0 }, groupIndex: 0, groupCount: 5 })).opacity).toBe(1);
  });

  it("throws InvalidEffectParamsError on bad params", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, delayPerGroup: -1 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("line-wipe — properties", () => {
  const e = def();

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbLineWipeParams, fc.double({ min: 0, max: 200, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const a = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 });
        const b = makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 });
        expect(e.applyEffect(a)).toEqual(e.applyEffect(b));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (opacity in [0,1])", () => {
    fc.assert(
      fc.property(arbLineWipeParams, fc.double({ min: 0, max: 200, noNaN: true }), fc.nat(40), (params, t, gi) => {
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: gi + 2 }));
        expect(Number.isFinite(ov.opacity!)).toBe(true);
        expect(ov.opacity!).toBeGreaterThanOrEqual(0);
        expect(ov.opacity!).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 3: terminal identity (opacity 1 at/after threshold + fadeSeconds)", () => {
    fc.assert(
      fc.property(arbLineWipeParams, fc.nat(40), (params, gi) => {
        const count = gi + 2;
        const threshold = params.direction === "forward"
          ? params.startDelay + gi * params.delayPerGroup
          : params.startDelay + (count - 1 - gi) * params.delayPerGroup;
        const t = threshold + params.fadeSeconds + 1;
        const ov = e.applyEffect(makeArgs({ params, t, groupIndex: gi, groupCount: count }));
        expect(ov.opacity).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
