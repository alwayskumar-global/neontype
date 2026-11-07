import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { InvalidEffectParamsError } from "../../errors.js";
import {
  createRegistry,
  type ApplyEffectArgs,
  type EffectDefinition,
} from "../../registry.js";
import {
  arbTypewriterParams,
  arbTypewriterBackwardParams,
} from "../../testing/arbitraries.js";
import { register } from "./index.js";

/** Registers `typewriter` into a fresh registry and returns its definition. */
function getTypewriter(): EffectDefinition {
  const registry = createRegistry();
  register(registry);
  const def = registry.get("typewriter");
  if (!def) throw new Error("typewriter not registered");
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

describe("typewriter effect", () => {
  const forward = { startDelay: 0, delayPerCharacter: 1, direction: "forward" };
  const backward = {
    startDelay: 0,
    delayPerCharacter: 1,
    direction: "backward",
  };

  it("registers under the id 'typewriter'", () => {
    const def = getTypewriter();
    expect(def.id).toBe("typewriter");
  });

  it("forward: opacity is 0 below the reveal threshold", () => {
    const def = getTypewriter();
    // groupIndex 2, delayPerCharacter 1 => threshold = 0 + 2*1 = 2; t=1 < 2.
    const out = def.applyEffect(
      makeArgs({ params: forward, groupIndex: 2, groupCount: 5, t: 1 }),
    );
    expect(out.opacity).toBe(0);
  });

  it("forward: opacity is 1 at the reveal threshold", () => {
    const def = getTypewriter();
    // threshold = 2; t=2 >= 2.
    const out = def.applyEffect(
      makeArgs({ params: forward, groupIndex: 2, groupCount: 5, t: 2 }),
    );
    expect(out.opacity).toBe(1);
  });

  it("forward: opacity is 1 above the reveal threshold", () => {
    const def = getTypewriter();
    // threshold = 2; t=3 >= 2.
    const out = def.applyEffect(
      makeArgs({ params: forward, groupIndex: 2, groupCount: 5, t: 3 }),
    );
    expect(out.opacity).toBe(1);
  });

  it("backward: opacity is 0 below the reveal threshold", () => {
    const def = getTypewriter();
    // threshold = (5 - 1 - 2)*1 = 2; t=1 < 2.
    const out = def.applyEffect(
      makeArgs({ params: backward, groupIndex: 2, groupCount: 5, t: 1 }),
    );
    expect(out.opacity).toBe(0);
  });

  it("backward: opacity is 1 at the reveal threshold", () => {
    const def = getTypewriter();
    // threshold = (5 - 1 - 2)*1 = 2; t=2 >= 2.
    const out = def.applyEffect(
      makeArgs({ params: backward, groupIndex: 2, groupCount: 5, t: 2 }),
    );
    expect(out.opacity).toBe(1);
  });

  it("applies the startDelay default of 0 when startDelay is omitted", () => {
    const def = getTypewriter();
    // Omitting startDelay => defaults to 0, matching `forward` behavior.
    const params = { delayPerCharacter: 1, direction: "forward" };
    const below = def.applyEffect(
      makeArgs({ params, groupIndex: 2, groupCount: 5, t: 1 }),
    );
    const atThreshold = def.applyEffect(
      makeArgs({ params, groupIndex: 2, groupCount: 5, t: 2 }),
    );
    expect(below.opacity).toBe(0);
    expect(atThreshold.opacity).toBe(1);
  });

  it("throws InvalidEffectParamsError for a negative delayPerCharacter", () => {
    const def = getTypewriter();
    expect(() =>
      def.applyEffect(
        makeArgs({ params: { delayPerCharacter: -1, direction: "forward" } }),
      ),
    ).toThrow(InvalidEffectParamsError);
  });

  it("throws InvalidEffectParamsError for an invalid direction", () => {
    const def = getTypewriter();
    expect(() =>
      def.applyEffect(
        makeArgs({
          params: { delayPerCharacter: 1, direction: "sideways" },
        }),
      ),
    ).toThrow(InvalidEffectParamsError);
  });

  it("throws InvalidEffectParamsError when direction is missing", () => {
    const def = getTypewriter();
    expect(() =>
      def.applyEffect(makeArgs({ params: { delayPerCharacter: 1 } })),
    ).toThrow(InvalidEffectParamsError);
  });

  // Feature: engine-core, Property 14: Typewriter opacity correctness (forward direction)
  // The property mirrors the implementation's forward threshold formula EXACTLY
  // (opacity is 1 once tLocal reaches startDelay + groupIndex*delayPerCharacter,
  // else 0) so it acts as a faithful oracle. Forward does not read groupCount,
  // but a valid (groupIndex, groupCount) pair with 0 <= groupIndex < groupCount
  // is still supplied: `groupIndex` is `fc.nat()` and `groupCount` is derived as
  // `groupIndex + 1 + extra` (extra = fc.nat()), guaranteeing groupCount >
  // groupIndex. tLocal is a non-negative finite float (noDefaultInfinity avoids
  // a +Infinity tLocal so the >= comparison stays unambiguous).
  it("Property 14: forward opacity matches the reveal threshold rule", () => {
    const def = getTypewriter();
    fc.assert(
      fc.property(
        arbTypewriterParams,
        fc.nat(),
        fc.nat(),
        fc.float({ min: 0, noNaN: true, noDefaultInfinity: true }),
        (params, groupIndex, extra, tLocal) => {
          const groupCount = groupIndex + 1 + extra; // 0 <= groupIndex < groupCount
          const threshold =
            params.startDelay + groupIndex * params.delayPerCharacter;
          const expected = tLocal >= threshold ? 1 : 0;
          const out = def.applyEffect(
            makeArgs({ params, groupIndex, groupCount, t: tLocal }),
          );
          return out.opacity === expected;
        },
      ),
    );
  });

  // Feature: engine-core, Property 16: Typewriter opacity correctness (backward direction)
  // The property mirrors the implementation's backward threshold formula EXACTLY
  // (opacity is 1 once tLocal reaches
  // startDelay + (groupCount - 1 - groupIndex)*delayPerCharacter, else 0), so it
  // is a faithful oracle. Backward DOES read groupCount, so a valid pair with
  // 0 <= groupIndex < groupCount is derived from two fc.nat() values a, b:
  // groupCount = max(a, b) + 1 and groupIndex = min(a, b), which guarantees
  // groupIndex < groupCount. tLocal is a non-negative finite float.
  it("Property 16: backward opacity matches the reveal threshold rule", () => {
    const def = getTypewriter();
    fc.assert(
      fc.property(
        arbTypewriterBackwardParams,
        fc.nat(),
        fc.nat(),
        fc.float({ min: 0, noNaN: true, noDefaultInfinity: true }),
        (params, a, b, tLocal) => {
          const groupCount = Math.max(a, b) + 1;
          const groupIndex = Math.min(a, b); // 0 <= groupIndex < groupCount
          const threshold =
            params.startDelay +
            (groupCount - 1 - groupIndex) * params.delayPerCharacter;
          const expected = tLocal >= threshold ? 1 : 0;
          const out = def.applyEffect(
            makeArgs({ params, groupIndex, groupCount, t: tLocal }),
          );
          return out.opacity === expected;
        },
      ),
    );
  });
});
