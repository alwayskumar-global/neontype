/**
 * Unit tests for `computeFrameState` (Task 8.2).
 *
 * These are the deterministic, example-based unit tests (NO fast-check — the
 * property-based suite is Task 8.3). They cover, exhaustively:
 *
 *   VISIBILITY (R5.6, R5.7):
 *     - active at exact `startSeconds`;
 *     - inactive just before `startSeconds`;
 *     - inactive at exact `endSeconds` when `endSeconds < durationSeconds`;
 *     - ACTIVE at exact `endSeconds` when `endSeconds === durationSeconds`
 *       (the end-of-timeline inclusivity exception);
 *     - the Task 8.1 active/inactive pairing.
 *   t CLAMPING (R5.5, R5.8):
 *     - `t < 0` clamps to `0`;
 *     - `t > durationSeconds` clamps to `durationSeconds`;
 *     - `t = NaN`, `Infinity`, `-Infinity` each return a valid `FrameState`
 *       without throwing (all equal to the `t = 0` result).
 *   WARNINGS (R5.10, R5.13, R5.14):
 *     - unknown effect id → `UnknownEffect` warning; segment still renders;
 *     - `applyEffect` throw → `InvalidEffectParams` warning, no effect applied;
 *     - non-finite override field → `InvalidEffectParams` warning, that field
 *       discarded, sibling finite fields kept.
 *   -0 NORMALISATION (R5.14):
 *     - `-0` override fields become `+0`;
 *     - `-0` interpolated transform fields become `+0`.
 *   SANITY (R5.9):
 *     - no-effect layer → every segment `effectOverrides: null`;
 *     - builtin `typewriter` through compute hides a character with opacity 0.
 */

import { describe, it, expect } from "vitest";

import { computeFrameState } from "./compute.js";
import { createRegistry, type EffectRegistry } from "./registry.js";
import { FakeMetricsProvider } from "./metrics.js";
import { interpolateTrack } from "./interpolate.js";
import { builtinRegistry } from "./effects/index.js";
import type { Project, TextLayer } from "./schemas/project.js";
import type { EffectInstance } from "./schemas/effect-instance.js";

/** Builds a minimal valid `TextLayer` with sensible defaults. */
function makeLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: "layer-1",
    text: "ab",
    tracks: [],
    effectInstances: [],
    fontFamily: "sans-serif",
    fontSize: 16,
    fontWeight: "400",
    fill: "#ffffff",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    maxWidth: null,
    startSeconds: 0,
    endSeconds: 10,
    anchor: { x: 0, y: 0 },
    ...overrides,
  };
}

/** Builds a minimal valid `Project` around the given layers. */
function makeProject(layers: TextLayer[], overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 800, height: 450, fps: 30, durationSeconds: 10 },
    background: "#000000",
    seed: 42,
    layers,
    ...overrides,
  };
}

/** Standard opts passing the deterministic fake metrics provider. */
const opts = { metricsProvider: FakeMetricsProvider } as const;

describe("computeFrameState — layer visibility (R5.6, R5.7)", () => {
  it("includes a layer active at exactly startSeconds and excludes one that starts later", () => {
    const active = makeLayer({ id: "active", startSeconds: 0, endSeconds: 5 });
    const inactive = makeLayer({ id: "inactive", startSeconds: 6, endSeconds: 9 });
    const project = makeProject([active, inactive]);

    const state = computeFrameState(project, 2, opts);

    const ids = state.layers.map((l) => l.layerId);
    expect(ids).toContain("active");
    expect(ids).not.toContain("inactive");
  });

  it("is active at exactly t === startSeconds", () => {
    const layer = makeLayer({ startSeconds: 2, endSeconds: 8 });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 2, opts);

    expect(state.layers.map((l) => l.layerId)).toContain("layer-1");
  });

  it("is inactive just before startSeconds", () => {
    const layer = makeLayer({ startSeconds: 2, endSeconds: 8 });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1.999, opts);

    expect(state.layers).toHaveLength(0);
  });

  it("is inactive at exactly t === endSeconds when endSeconds < durationSeconds", () => {
    // end = 8 < duration = 10 → half-open interval excludes t === 8.
    const layer = makeLayer({ startSeconds: 2, endSeconds: 8 });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 8, opts);

    expect(state.layers).toHaveLength(0);
  });

  it("is ACTIVE at exactly t === endSeconds when endSeconds === durationSeconds", () => {
    // end = 10 === duration = 10 → end-of-timeline inclusivity keeps it active.
    const layer = makeLayer({ startSeconds: 2, endSeconds: 10 });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 10, opts);

    expect(state.layers.map((l) => l.layerId)).toContain("layer-1");
  });
});

describe("computeFrameState — t clamping (R5.5, R5.8)", () => {
  const opacityTrack = {
    property: "opacity" as const,
    keyframes: [
      { t: 0, value: 0, easing: "linear" as const },
      { t: 4, value: 1, easing: "linear" as const },
    ],
  };

  it("clamps t < 0 to 0 (consistent with t === 0)", () => {
    const layer = makeLayer({ startSeconds: 0, endSeconds: 10, tracks: [opacityTrack] });
    const project = makeProject([layer]);

    const clamped = computeFrameState(project, -5, opts);
    const atZero = computeFrameState(project, 0, opts);

    // tLocal = 0 → opacity 0 (first keyframe value).
    const expected = interpolateTrack(opacityTrack, 0);
    expect(clamped.layers[0].transform.opacity).toBe(expected);
    expect(clamped).toEqual(atZero);
  });

  it("clamps t > durationSeconds to durationSeconds (consistent with t === duration)", () => {
    // end === duration so the layer stays active at the clamped boundary.
    const layer = makeLayer({ startSeconds: 0, endSeconds: 10, tracks: [opacityTrack] });
    const project = makeProject([layer]);

    const clamped = computeFrameState(project, 999, opts);
    const atDuration = computeFrameState(project, 10, opts);

    // tLocal = 10 is past the last keyframe → clamps to last value (1).
    const expected = interpolateTrack(opacityTrack, 10);
    expect(clamped.layers[0].transform.opacity).toBe(expected);
    expect(clamped.layers[0].transform.opacity).toBe(1);
    expect(clamped).toEqual(atDuration);
  });

  it("returns a valid FrameState for non-finite t without throwing (all clamp to 0)", () => {
    const layer = makeLayer({ startSeconds: 0, endSeconds: 10, tracks: [opacityTrack] });
    const project = makeProject([layer]);

    const atZero = computeFrameState(project, 0, opts);

    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => computeFrameState(project, bad, opts)).not.toThrow();

      const state = computeFrameState(project, bad, opts);
      // Shape: a valid FrameState has layers and warnings arrays.
      expect(Array.isArray(state.layers)).toBe(true);
      expect(Array.isArray(state.warnings)).toBe(true);
      // All three clamp to 0, so each equals the t === 0 result.
      expect(state).toEqual(atZero);
    }
  });
});

describe("computeFrameState — warnings (R5.10, R5.13)", () => {
  it("emits an UnknownEffect warning for an unregistered effect id; segment still renders", () => {
    const inst: EffectInstance = {
      effectId: "does-not-exist",
      granularity: "character",
      params: {},
    };
    const layer = makeLayer({ effectInstances: [inst] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1, {
      metricsProvider: FakeMetricsProvider,
      registry: createRegistry(), // empty registry: nothing is known
    });

    expect(state.warnings).toContainEqual({
      type: "UnknownEffect",
      effectId: "does-not-exist",
      layerId: "layer-1",
    });
    // The segments still render, with no effect override.
    expect(state.layers[0].segments.length).toBe(2);
    expect(state.layers[0].segments[0].effectOverrides).toBeNull();
    expect(state.layers[0].segments[1].effectOverrides).toBeNull();
  });

  it("turns an applyEffect throw into an InvalidEffectParams warning without throwing", () => {
    const registry: EffectRegistry = createRegistry();
    registry.register({
      id: "boom",
      displayName: "Boom",
      // paramSchema is unused by compute; a permissive stand-in is fine here.
      paramSchema: {
        safeParse: () => ({ success: true, data: {} }),
      } as never,
      applyEffect() {
        throw new Error("explode");
      },
    });

    const inst: EffectInstance = {
      effectId: "boom",
      granularity: "character",
      params: {},
    };
    const layer = makeLayer({ effectInstances: [inst] });
    const project = makeProject([layer]);

    let state!: ReturnType<typeof computeFrameState>;
    expect(() => {
      state = computeFrameState(project, 1, {
        metricsProvider: FakeMetricsProvider,
        registry,
      });
    }).not.toThrow();

    expect(
      state.warnings.some(
        (w) => w.type === "InvalidEffectParams" && w.effectId === "boom" && w.layerId === "layer-1",
      ),
    ).toBe(true);
    // Segment rendered with no effect applied (boom was the only instance).
    expect(state.layers[0].segments[0].effectOverrides).toBeNull();
    expect(state.layers[0].segments[1].effectOverrides).toBeNull();
  });
});

describe("computeFrameState — non-finite override discard (R5.13)", () => {
  it("discards a non-finite override field, warns, and keeps a sibling finite field", () => {
    const registry: EffectRegistry = createRegistry();
    registry.register({
      id: "mixed",
      displayName: "Mixed",
      paramSchema: {
        safeParse: () => ({ success: true, data: {} }),
      } as never,
      applyEffect() {
        // opacity is non-finite → discarded + warning; blur is finite → kept.
        return { opacity: Infinity, blur: 3 };
      },
    });

    const inst: EffectInstance = {
      effectId: "mixed",
      granularity: "character",
      params: {},
    };
    const layer = makeLayer({ effectInstances: [inst] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1, {
      metricsProvider: FakeMetricsProvider,
      registry,
    });

    expect(
      state.warnings.some(
        (w) => w.type === "InvalidEffectParams" && w.effectId === "mixed" && w.layerId === "layer-1",
      ),
    ).toBe(true);

    const ov = state.layers[0].segments[0].effectOverrides;
    expect(ov).not.toBeNull();
    // Non-finite opacity was discarded.
    expect(ov?.opacity).toBeUndefined();
    // Finite sibling blur survived.
    expect(ov?.blur).toBe(3);
  });

  it("discards a non-finite positionOffset component and yields null overrides when it was the only field", () => {
    const registry: EffectRegistry = createRegistry();
    registry.register({
      id: "bad-offset",
      displayName: "BadOffset",
      paramSchema: {
        safeParse: () => ({ success: true, data: {} }),
      } as never,
      applyEffect() {
        return { positionOffset: [NaN, 0] };
      },
    });

    const inst: EffectInstance = {
      effectId: "bad-offset",
      granularity: "character",
      params: {},
    };
    const layer = makeLayer({ effectInstances: [inst] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1, {
      metricsProvider: FakeMetricsProvider,
      registry,
    });

    expect(
      state.warnings.some(
        (w) => w.type === "InvalidEffectParams" && w.effectId === "bad-offset",
      ),
    ).toBe(true);
    // The only field was discarded → no overrides remain.
    expect(state.layers[0].segments[0].effectOverrides).toBeNull();
  });
});

describe("computeFrameState — -0 normalisation (R5.14)", () => {
  it("normalises -0 override values to +0", () => {
    const registry: EffectRegistry = createRegistry();
    registry.register({
      id: "neg-zero",
      displayName: "NegZero",
      paramSchema: {
        safeParse: () => ({ success: true, data: {} }),
      } as never,
      applyEffect() {
        // Both components are -0, which must be normalised to +0.
        return { positionOffset: [-0, -0] };
      },
    });

    const inst: EffectInstance = {
      effectId: "neg-zero",
      granularity: "character",
      params: {},
    };
    const layer = makeLayer({ effectInstances: [inst] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1, {
      metricsProvider: FakeMetricsProvider,
      registry,
    });

    const offset = state.layers[0].segments[0].effectOverrides?.positionOffset;
    expect(offset).toBeDefined();
    expect(Object.is(offset![0], -0)).toBe(false);
    expect(Object.is(offset![1], -0)).toBe(false);
    expect(offset![0]).toBe(0);
    expect(offset![1]).toBe(0);
  });

  it("normalises a -0 interpolated transform field to +0", () => {
    // A position track whose endpoints are both -0 interpolates to -0, which
    // the final normalisation pass must turn into +0.
    const positionTrack = {
      property: "position" as const,
      keyframes: [
        { t: 0, value: [-0, -0] as [number, number], easing: "linear" as const },
        { t: 4, value: [-0, -0] as [number, number], easing: "linear" as const },
      ],
    };
    const layer = makeLayer({ startSeconds: 0, endSeconds: 10, tracks: [positionTrack] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 2, opts);

    const [px, py] = state.layers[0].transform.positionOffset;
    expect(Object.is(px, -0)).toBe(false);
    expect(Object.is(py, -0)).toBe(false);
    expect(px).toBe(0);
    expect(py).toBe(0);
  });
});

describe("computeFrameState — tLocal and sanity (R5.9, R5.11)", () => {
  it("interpolates tracks at layer-local time (tLocal), not global t", () => {
    const opacityTrack = {
      property: "opacity" as const,
      keyframes: [
        { t: 0, value: 0, easing: "linear" as const },
        { t: 4, value: 1, easing: "linear" as const },
      ],
    };
    const layer = makeLayer({
      id: "delayed",
      startSeconds: 2,
      endSeconds: 10,
      tracks: [opacityTrack],
    });
    const project = makeProject([layer]);

    const globalT = 4; // tLocal = 4 - 2 = 2 → opacity 0.5, not 1.0
    const state = computeFrameState(project, globalT, opts);

    const expected = interpolateTrack(opacityTrack, globalT - layer.startSeconds);
    expect(state.layers[0].transform.opacity).toBe(expected);
    expect(state.layers[0].transform.opacity).toBe(0.5);
  });

  it("gives every segment null effectOverrides when the layer has no effects", () => {
    const layer = makeLayer({ text: "abc", effectInstances: [] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 1, opts);

    expect(state.layers[0].segments).toHaveLength(3);
    for (const seg of state.layers[0].segments) {
      expect(seg.effectOverrides).toBeNull();
    }
  });

  it("drives the builtin typewriter effect through compute: a not-yet-revealed character has opacity 0", () => {
    // forward typewriter: group i reveals at startDelay + i * delayPerCharacter.
    // With startDelay 0 and delayPerCharacter 1, at tLocal = 0.5 only group 0
    // (threshold 0) is revealed; group 1 (threshold 1) is still hidden.
    const inst: EffectInstance = {
      effectId: "typewriter",
      granularity: "character",
      params: { startDelay: 0, delayPerCharacter: 1, direction: "forward" },
    };
    const layer = makeLayer({ text: "ab", startSeconds: 0, endSeconds: 10, effectInstances: [inst] });
    const project = makeProject([layer]);

    const state = computeFrameState(project, 0.5, {
      metricsProvider: FakeMetricsProvider,
      registry: builtinRegistry,
    });

    expect(state.layers[0].segments[0].effectOverrides?.opacity).toBe(1);
    expect(state.layers[0].segments[1].effectOverrides?.opacity).toBe(0);
  });
});

/**
 * Property-based tests for `computeFrameState` (Task 8.3).
 *
 * These fast-check properties complement the deterministic unit tests above.
 * They run `computeFrameState` against `arbValidProject` — which (per Task 7.8)
 * generates projects whose layers carry real built-in effect instances
 * (`typewriter` / `fade-slide`) across all three granularities — and `arbT`,
 * the project-dependent time generator. Every call uses the DEFAULT registry
 * (`builtinRegistry`, left implicit) so the generated effect instances resolve
 * to the real effects, and `FakeMetricsProvider` so the suite runs headlessly
 * in Node.
 *
 * ## Opts strategy
 *
 * `freshOpts()` returns a brand-new options object on every call, so each
 * `computeFrameState` invocation gets its own fresh `layoutCache` (the engine
 * auto-creates one when `layoutCache` is omitted). Properties use `freshOpts()`
 * per call by default; Property 5 additionally exercises a SHARED cache to prove
 * random access is order-independent even through a warm cache. `registry` is
 * never passed, so it defaults to `builtinRegistry` — the generated
 * `typewriter`/`fade-slide` ids all resolve to real effects.
 *
 * ## Project + t pairing
 *
 * `arbT` depends on the project (its range is `[0, durationSeconds]`), so the
 * project and its time are paired with `.chain`:
 *   `arbValidProject.chain((project) => fc.tuple(fc.constant(project), arbT(project)))`
 * Property 5 pairs a project with TWO independent `arbT` values.
 */

import fc from "fast-check";

import { arbValidProject, arbT } from "./testing/arbitraries.js";

/**
 * A fresh options object per call: `metricsProvider` is the deterministic fake,
 * `layoutCache` is omitted so the engine creates a new `Map` each time, and
 * `registry` is omitted so it defaults to `builtinRegistry`.
 */
const freshOpts = () => ({ metricsProvider: FakeMetricsProvider });

/** Pairs a valid project with one in-range time via `.chain` (arbT depends on p). */
const arbProjectAndT = arbValidProject.chain((project) =>
  fc.tuple(fc.constant(project), arbT(project)),
);

/** Pairs a valid project with two independent in-range times (for Property 5). */
const arbProjectAndTwoT = arbValidProject.chain((project) =>
  fc.tuple(fc.constant(project), arbT(project), arbT(project)),
);

/** The grapheme clusters of `text`, in order, per `Intl.Segmenter`. */
function graphemeClusters(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((seg) => seg.segment);
}

describe("computeFrameState — property-based (Task 8.3)", () => {
  // Feature: engine-core, Property 3: computeFrameState total function
  it("Property 3: is a total function — never throws and returns a FrameState", () => {
    fc.assert(
      fc.property(arbProjectAndT, ([project, t]) => {
        expect(() => computeFrameState(project, t, freshOpts())).not.toThrow();
        const state = computeFrameState(project, t, freshOpts());
        expect(state).toHaveProperty("layers");
        expect(state).toHaveProperty("warnings");
        expect(Array.isArray(state.layers)).toBe(true);
        expect(Array.isArray(state.warnings)).toBe(true);
      }),
    );
  });

  // Feature: engine-core, Property 4: computeFrameState determinism
  it("Property 4: two sequential calls with the same inputs are deeply equal", () => {
    fc.assert(
      fc.property(arbProjectAndT, ([project, t]) => {
        // Fresh opts for each call so the result cannot depend on a carried-over
        // layoutCache — determinism must hold on inputs alone.
        const a = computeFrameState(project, t, freshOpts());
        const b = computeFrameState(project, t, freshOpts());
        expect(b).toEqual(a);
      }),
    );
  });

  // Feature: engine-core, Property 5: computeFrameState random-access determinism
  it("Property 5: computing t1 before t2 does not change the t2 result", () => {
    fc.assert(
      fc.property(arbProjectAndTwoT, ([project, t1, t2]) => {
        // Reference: t2 computed in isolation with its own fresh cache.
        const direct = computeFrameState(project, t2, freshOpts());

        // Sequence through ONE shared opts object (shared, warming layoutCache):
        // compute t1 first, then t2. Random-access determinism requires the t2
        // result to be identical to the isolated reference — no hidden state and
        // no cache-order dependence may leak between calls.
        const shared = freshOpts();
        computeFrameState(project, t1, shared);
        const after = computeFrameState(project, t2, shared);

        expect(after).toEqual(direct);
      }),
    );
  });

  // Feature: engine-core, Property 6: Non-finite t handled safely
  it("Property 6: NaN / Infinity / -Infinity each return a valid FrameState without throwing", () => {
    fc.assert(
      fc.property(arbValidProject, (project) => {
        for (const bad of [NaN, Infinity, -Infinity]) {
          expect(() => computeFrameState(project, bad, freshOpts())).not.toThrow();
          const state = computeFrameState(project, bad, freshOpts());
          expect(Array.isArray(state.layers)).toBe(true);
          expect(Array.isArray(state.warnings)).toBe(true);
        }
      }),
    );
  });

  // Feature: engine-core, Property 9: FrameState JSON round-trip
  it("Property 9: FrameState round-trips through JSON unchanged", () => {
    fc.assert(
      fc.property(arbProjectAndT, ([project, t]) => {
        const state = computeFrameState(project, t, freshOpts());
        // No undefined / NaN / Infinity / functions survive JSON, and -0 is
        // already normalised to +0, so the parsed clone must deep-equal state.
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      }),
    );
  });

  // Feature: engine-core, Property 10: Opacity bounds invariant
  it("Property 10: every layer transform opacity and segment override opacity is in [0, 1]", () => {
    fc.assert(
      fc.property(arbProjectAndT, ([project, t]) => {
        const state = computeFrameState(project, t, freshOpts());
        for (const layer of state.layers) {
          // Layer transform opacity is bounded to [0, 1].
          expect(layer.transform.opacity).toBeGreaterThanOrEqual(0);
          expect(layer.transform.opacity).toBeLessThanOrEqual(1);
          // Each segment's composed effect opacity (when present) is bounded too.
          for (const seg of layer.segments) {
            const ov = seg.effectOverrides;
            if (ov && ov.opacity !== undefined) {
              expect(ov.opacity).toBeGreaterThanOrEqual(0);
              expect(ov.opacity).toBeLessThanOrEqual(1);
            }
          }
        }
      }),
    );
  });

  // Feature: engine-core, Property 11: Grapheme cluster completeness invariant
  it("Property 11: active-layer segment texts match Intl.Segmenter grapheme clusters exactly", () => {
    fc.assert(
      fc.property(arbProjectAndT, ([project, t]) => {
        const state = computeFrameState(project, t, freshOpts());
        for (const ls of state.layers) {
          const layer = project.layers.find((l) => l.id === ls.layerId);
          expect(layer).toBeDefined();
          const expected = graphemeClusters(layer!.text);
          const actual = ls.segments.map((s) => s.text);
          expect(actual).toEqual(expected);
        }
      }),
    );
  });
});
