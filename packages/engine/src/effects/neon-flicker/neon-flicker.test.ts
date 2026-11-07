/**
 * Unit + property tests for the `neon-flicker` effect (looping).
 *
 * Properties: 1 (determinism), 2 (bounded — opacity in [minOpacity, 1] ⊂
 * [0,1]), 4 (loop period: opacity(t) == opacity(t + period)), 5 (brightness
 * differs across distinct cell indices). Looping ⇒ no terminal-identity
 * property. Unit tests pin the opacity range across a period and the throw.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createPRNG } from "../../prng.js";
import { InvalidEffectParamsError } from "../../errors.js";
import { createRegistry } from "../../registry.js";
import type { ApplyEffectArgs } from "../../registry.js";
import { arbNeonFlickerParams } from "../../testing/arbitraries.js";
import { register } from "./index.js";

function def() {
  const r = createRegistry();
  register(r);
  return r.get("neon-flicker")!;
}

function makeArgs(over: Partial<ApplyEffectArgs> = {}): ApplyEffectArgs {
  return {
    groupText: "a", charIndex: 0, wordIndex: 0, lineIndex: 0,
    groupIndex: 0, groupCount: 1, t: 0, params: {}, prng: createPRNG(1),
    ...over,
  };
}

const D = { periodSeconds: 1, minOpacity: 0.4, cellsPerPeriod: 16, phasePerGroup: 0 };

describe("neon-flicker — unit", () => {
  const e = def();

  it("opacity stays within [minOpacity, 1] across a period", () => {
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * D.periodSeconds;
      const ov = e.applyEffect(makeArgs({ t, params: D, prng: createPRNG(42) }));
      expect(ov.opacity!).toBeGreaterThanOrEqual(D.minOpacity - 1e-12);
      expect(ov.opacity!).toBeLessThanOrEqual(1);
    }
  });

  it("minOpacity = 1 pins opacity to exactly 1", () => {
    for (let i = 0; i < 20; i++) {
      const ov = e.applyEffect(makeArgs({ t: i * 0.05, params: { ...D, minOpacity: 1 }, prng: createPRNG(7) }));
      expect(ov.opacity).toBe(1);
    }
  });

  it("throws InvalidEffectParamsError on bad params (cellsPerPeriod = 0)", () => {
    expect(() => e.applyEffect(makeArgs({ params: { ...D, cellsPerPeriod: 0 } }))).toThrow(
      InvalidEffectParamsError,
    );
  });
});

describe("neon-flicker — properties", () => {
  const e = def();
  // Identical seed for both calls so determinism/loop comparisons are fair
  // (in production derivePRNG re-seeds identically per frame).
  const at = (params: unknown, t: number, gi: number): number =>
    e.applyEffect(makeArgs({ params: params as Record<string, unknown>, t, groupIndex: gi, groupCount: gi + 1, prng: createPRNG(999) })).opacity!;

  it("Property 1: determinism", () => {
    fc.assert(
      fc.property(arbNeonFlickerParams, fc.double({ min: 0, max: 50, noNaN: true }), fc.nat(20), (params, t, gi) => {
        expect(at(params, t, gi)).toBe(at(params, t, gi));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2: bounded output (opacity in [minOpacity, 1])", () => {
    fc.assert(
      fc.property(arbNeonFlickerParams, fc.double({ min: 0, max: 50, noNaN: true }), fc.nat(20), (params, t, gi) => {
        const o = at(params, t, gi);
        expect(Number.isFinite(o)).toBe(true);
        expect(o).toBeGreaterThanOrEqual(params.minOpacity - 1e-12);
        expect(o).toBeLessThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });

  // Phase at time `t` for group `gi`, using the SAME formula as the effect.
  const phaseOf = (params: { periodSeconds: number; phasePerGroup: number }, t: number, gi: number): number => {
    const period = params.periodSeconds;
    const raw = t - gi * params.phasePerGroup;
    return ((raw % period) + period) % period;
  };

  it("Property 4: loop period — opacity(t) == opacity(t + period)", () => {
    fc.assert(
      // The effect repeats every period in exact arithmetic. Near a CELL BOUNDARY
      // (where f = phase/period*cellsPerPeriod is an integer) a 1-ULP FP
      // difference between (t % period) and ((t + period) % period) can flip the
      // integer cell index k, changing the PRNG draw count and the drawn value.
      // That is an FP artefact of the test's `t + period`, not a loop defect, so
      // we discard samples that land within 1e-6 of a cell boundary at either t
      // or t + period via fc.pre (the discard rate stays low). Full fractional
      // params and real-valued t are retained.
      fc.property(arbNeonFlickerParams, fc.double({ min: 0, max: 50, noNaN: true }), fc.nat(10), (params, t, gi) => {
        const f1 = (phaseOf(params, t, gi) / params.periodSeconds) * params.cellsPerPeriod;
        const f2 = (phaseOf(params, t + params.periodSeconds, gi) / params.periodSeconds) * params.cellsPerPeriod;
        const nearBoundary = (f: number): boolean => Math.abs(f - Math.round(f)) < 1e-6;
        fc.pre(!nearBoundary(f1) && !nearBoundary(f2));
        const a = at(params, t, gi);
        const b = at(params, t + params.periodSeconds, gi);
        expect(b).toBe(a);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 4 (example): integer period/t, cell mid-points → exact loop equality in [minOpacity, 1]", () => {
    // Deterministic companion to the guarded property: integer period and t with
    // cell mid-point sampling make (t % period) and ((t + period) % period)
    // bit-identical, so equality is exact without any FP guard.
    const params = { periodSeconds: 4, minOpacity: 0.2, cellsPerPeriod: 8, phasePerGroup: 0 };
    for (let c = 0; c < params.cellsPerPeriod; c++) {
      const t = ((c + 0.5) / params.cellsPerPeriod) * params.periodSeconds; // cell mid-point
      const a = e.applyEffect(makeArgs({ t, params, groupIndex: 0, groupCount: 1, prng: createPRNG(321) })).opacity!;
      const b = e.applyEffect(makeArgs({ t: t + params.periodSeconds, params, groupIndex: 0, groupCount: 1, prng: createPRNG(321) })).opacity!;
      expect(b).toBe(a);
      expect(a).toBeGreaterThanOrEqual(params.minOpacity - 1e-12);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("Property 5: brightness differs across distinct cells for some input", () => {
    // Fixed params/seed; sample the center of each cell and confirm not constant.
    const params = { periodSeconds: 1, minOpacity: 0, cellsPerPeriod: 16, phasePerGroup: 0 };
    const vals: number[] = [];
    for (let c = 0; c < 16; c++) {
      const t = ((c + 0.5) / 16) * params.periodSeconds;
      vals.push(e.applyEffect(makeArgs({ t, params, prng: createPRNG(555) })).opacity!);
    }
    expect(new Set(vals).size).toBeGreaterThan(1);
  });
});
