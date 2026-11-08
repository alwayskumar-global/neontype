/**
 * Unit tests for uniform output scaling (Task 2.2).
 */

import { describe, it, expect } from "vitest";

import { resolveScalePlan, isScalePlan } from "./scale.js";

describe("resolveScalePlan — same size / omitted output", () => {
  it("renders at canvas size with no scaling when output is omitted", () => {
    const plan = resolveScalePlan({ width: 1920, height: 1080 });
    expect(isScalePlan(plan)).toBe(true);
    if (isScalePlan(plan)) {
      expect(plan.needsScaling).toBe(false);
      expect(plan.scale).toBe(1);
      expect([plan.outputWidth, plan.outputHeight]).toEqual([1920, 1080]);
    }
  });

  it("renders at canvas size when output equals canvas", () => {
    const plan = resolveScalePlan({ width: 1080, height: 1080 }, { width: 1080, height: 1080 });
    expect(isScalePlan(plan) && plan.needsScaling).toBe(false);
  });
});

describe("resolveScalePlan — differing size (uniform scale, no bars)", () => {
  it("uses a single scale factor outputWidth/canvasWidth on both axes", () => {
    const plan = resolveScalePlan({ width: 1920, height: 1080 }, { width: 1280, height: 720 });
    expect(isScalePlan(plan)).toBe(true);
    if (isScalePlan(plan)) {
      expect(plan.needsScaling).toBe(true);
      expect(plan.scale).toBeCloseTo(1280 / 1920, 12);
      // The same factor applied to height exactly fills the output height.
      expect(plan.canvasHeight * plan.scale).toBeCloseTo(720, 9);
    }
  });
});

describe("resolveScalePlan — rejection", () => {
  it("rejects an aspect-ratio mismatch with invalid-options", () => {
    const r = resolveScalePlan({ width: 1920, height: 1080 }, { width: 1000, height: 1000 });
    expect(isScalePlan(r)).toBe(false);
    if (!isScalePlan(r)) {
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error.code).toBe("invalid-options");
    }
  });

  it("rejects an out-of-range output dimension", () => {
    const r = resolveScalePlan({ width: 1920, height: 1080 }, { width: 99999, height: 56249 });
    expect(isScalePlan(r)).toBe(false);
  });
});

/* ----------------------------- Property tests ----------------------------- */

import fc from "fast-check";
import { validateOutputSize } from "./validate.js";

// Feature: exporters, Property 4: Uniform scaling with no bars, and aspect/range validation
describe("Property 4: Uniform scaling with no bars, and aspect/range validation", () => {
  it("uniform scale = outputWidth/canvasWidth, larger-axis mismatch <= 1, for validator-accepted outputs", () => {
    let kept = 0;
    let discarded = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 3840 }),
        fc.integer({ min: 16, max: 2160 }),
        fc.integer({ min: 1, max: 7680 }),
        (canvasWidth, canvasHeight, rawOutputWidth) => {
          const canvas = { width: canvasWidth, height: canvasHeight };
          // Derive the output consistently from the canvas ratio, matching the
          // validator's own rule, then clamp into bounds.
          const outputWidth = Math.min(rawOutputWidth, 7680);
          const outputHeight = Math.min(
            4320,
            Math.max(1, Math.round((canvasHeight * outputWidth) / canvasWidth)),
          );
          // Discard any pair the validator rejects (out of range or aspect > 1px).
          const accepted = validateOutputSize({ width: outputWidth, height: outputHeight }, canvas) === null;
          fc.pre(accepted);
          if (accepted) kept++; else discarded++;

          const plan = resolveScalePlan(canvas, { width: outputWidth, height: outputHeight });
          expect(isScalePlan(plan)).toBe(true);
          if (isScalePlan(plan)) {
            // Single uniform scale factor on both axes.
            expect(plan.scale).toBeCloseTo(outputWidth / canvasWidth, 12);
            // Larger-axis mismatch under the same rule the validator uses.
            const mismatch =
              outputHeight >= outputWidth
                ? Math.abs((canvasHeight * outputWidth) / canvasWidth - outputHeight)
                : Math.abs((canvasWidth * outputHeight) / canvasHeight - outputWidth);
            expect(mismatch).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 300 },
    );
    // Discard-rate visibility without console output (no eslint-disable in src):
    // assert a healthy number of cases were KEPT and the discard rate stayed
    // well under fast-check's own too-many-discards ceiling. If fast-check had
    // complained about excessive discards it would have thrown above.
    const total = kept + discarded;
    const discardRate = total > 0 ? discarded / total : 0;
    expect(kept).toBeGreaterThan(50);
    expect(discardRate).toBeLessThan(0.5);
  });

  it("rejects a clearly-mismatched aspect ratio", () => {
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 1920 }), (side) => {
        // Canvas 2:1, output 1:1 at a comparable size -> mismatch > 1px.
        const canvas = { width: side * 2, height: side };
        const plan = resolveScalePlan(canvas, { width: side, height: side });
        expect(isScalePlan(plan)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
