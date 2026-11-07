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
import { EffectInstanceSchema } from "../schemas/effect-instance.js";
import {
  arbValidProject,
  arbValidEffectPack,
  arbTextLayer,
  arbEffectInstanceForLayer,
  arbGraphemeText,
} from "./arbitraries.js";

describe("arbitraries smoke tests", () => {
  it("every arbValidProject (with effect instances) passes ProjectSchema.safeParse", () => {
    // Task 7.8 extended layers to carry 0..4 effect instances; the generator
    // must keep every project schema-valid (regression guard for the extension).
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
        expect(layer.effectInstances.length).toBeLessThanOrEqual(16);
      }
    }
  });

  it("arbEffectInstanceForLayer: every instance passes EffectInstanceSchema and covers built-ins + granularities", () => {
    const instances = fc.sample(arbEffectInstanceForLayer, 500);
    const effectIds = new Set<string>();
    const granularities = new Set<string>();
    for (const instance of instances) {
      expect(EffectInstanceSchema.safeParse(instance).success).toBe(true);
      expect(["typewriter", "fade-slide"]).toContain(instance.effectId);
      effectIds.add(instance.effectId);
      granularities.add(instance.granularity);
    }
    // The extension is actually exercised: both built-ins and all three
    // granularities appear across the sample.
    expect(effectIds).toEqual(new Set(["typewriter", "fade-slide"]));
    expect(granularities).toEqual(new Set(["character", "word", "line"]));
  });

  it("arbValidProject: at least one sampled project has a non-empty effectInstances list", () => {
    // Deterministic sample (fixed count) proving the effectInstances extension
    // is exercised rather than always producing empty lists.
    const projects = fc.sample(arbValidProject, 200);
    const hasEffects = projects.some((p) =>
      p.layers.some((layer) => layer.effectInstances.length > 0),
    );
    expect(hasEffects).toBe(true);
  });

  it("arbGraphemeText: every sampled value is a non-empty string", () => {
    const texts = fc.sample(arbGraphemeText, 500);
    for (const text of texts) {
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
