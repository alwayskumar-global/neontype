import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createPRNG } from "./prng.js";
import { derivePRNG } from "./prng.js";

describe("createPRNG", () => {
  it("produces the expected first five values for seed 42 (mulberry32 reference)", () => {
    const prng = createPRNG(42);
    const values = [prng.next(), prng.next(), prng.next(), prng.next(), prng.next()];
    expect(values).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it("returns values in the half-open interval [0, 1) across many draws and seeds", () => {
    for (const seed of [0, 1, 42, 123456, 0xffffffff]) {
      const prng = createPRNG(seed);
      for (let i = 0; i < 1000; i++) {
        const value = prng.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});

describe("derivePRNG", () => {
  it("is deterministic: identical arguments produce identical first values", () => {
    const a = derivePRNG(42, "layer-a", 0, "character", 3);
    const b = derivePRNG(42, "layer-a", 0, "character", 3);
    expect(a.next()).toBe(b.next());
  });

  it("produces different first values when only layerId differs", () => {
    const a = derivePRNG(42, "layer-a", 0, "character", 3);
    const b = derivePRNG(42, "layer-b", 0, "character", 3);
    expect(a.next()).not.toBe(b.next());
  });
});

describe("createPRNG determinism", () => {
  // Feature: engine-core, Property 8: PRNG determinism
  it("produces the same first 10 values for two generators built from the same seed", () => {
    fc.assert(
      fc.property(fc.integer(), (s) => {
        const a = createPRNG(s);
        const b = createPRNG(s);
        const first = Array.from({ length: 10 }, () => a.next());
        const second = Array.from({ length: 10 }, () => b.next());
        expect(second).toEqual(first);
      }),
    );
  });
});

describe("derivePRNG layer independence", () => {
  // Feature: engine-core, Property 17: PRNG layer independence
  it("produces different first values for two distinct layerIds with identical other arguments", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.integer(),
        fc.string(),
        fc.integer(),
        (seed, layerA, layerB, effectInstanceIndex, granularity, segmentIndex) => {
          fc.pre(layerA !== layerB);
          const a = derivePRNG(seed, layerA, effectInstanceIndex, granularity, segmentIndex);
          const b = derivePRNG(seed, layerB, effectInstanceIndex, granularity, segmentIndex);
          expect(a.next()).not.toBe(b.next());
        },
      ),
    );
  });
});
