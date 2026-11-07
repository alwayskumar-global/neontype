/**
 * Smoke tests for the core fast-check arbitraries (Task 3.7).
 *
 * The contract of this module's generators is that every value they produce
 * satisfies the corresponding Zod schema — otherwise downstream property tests
 * (serialize/parse round-trip, EffectPack round-trip, etc.) would exercise
 * invalid inputs. These smoke tests pin that contract: each generated value
 * must pass `safeParse`. If any does not, the generator is wrong and must be
 * fixed (the schema is the source of truth and is never weakened here).
 *
 * numRuns is bumped to 300 so constraint drift in a generator surfaces
 * reliably rather than slipping past the default sample size.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { ProjectSchema } from "../schemas/project.js";
import { EffectPackSchema } from "../schemas/effect-pack.js";
import { arbValidProject, arbValidEffectPack, arbTextLayer } from "./arbitraries.js";

describe("arbitraries smoke tests", () => {
  it("every arbValidProject passes ProjectSchema.safeParse", () => {
    fc.assert(
      fc.property(arbValidProject, (p) => ProjectSchema.safeParse(p).success === true),
      { numRuns: 300 },
    );
  });

  it("every arbValidEffectPack passes EffectPackSchema.safeParse", () => {
    fc.assert(
      fc.property(
        arbValidEffectPack,
        (ep) => EffectPackSchema.safeParse(ep).success === true,
      ),
      { numRuns: 300 },
    );
  });

  it("arbValidProject safeParse reports no issues on a sampled value", () => {
    const [project] = fc.sample(arbValidProject, 1);
    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });

  it("regression: seed 2044512093 produces only schema-valid projects", () => {
    fc.assert(
      fc.property(arbValidProject, (p) => ProjectSchema.safeParse(p).success === true),
      { seed: 2044512093, numRuns: 1000 },
    );
  });

  it("arbTextLayer: 1000+ layers satisfy 0 <= start < end <= duration with finite times", () => {
    for (const d of [1, 10, 600]) {
      const layers = fc.sample(arbTextLayer(d), 1000);
      for (const layer of layers) {
        expect(Number.isFinite(layer.startSeconds)).toBe(true);
        expect(Number.isFinite(layer.endSeconds)).toBe(true);
        expect(layer.startSeconds).toBeGreaterThanOrEqual(0);
        expect(layer.endSeconds).toBeGreaterThan(layer.startSeconds);
        expect(layer.endSeconds).toBeLessThanOrEqual(d);
      }
    }
  });
});
