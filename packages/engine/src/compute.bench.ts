/**
 * Performance benchmark for `computeFrameState` (Requirement 15.3, 15.4).
 *
 * Vitest's `bench` API drives the timing loop and reports mean time plus
 * ops/sec (hz) for each case; this file never calls `performance.now`,
 * `Date.now`, or `Math.random` itself, keeping it compliant with the engine
 * `src/**` purity rules. A fresh `new Map()` is passed as `layoutCache` inside
 * every iteration so each run measures a COLD cache (no cross-iteration
 * memoization), which is the worst case a caller can hit on a seek.
 *
 * Two fixtures are benchmarked:
 *
 * - `project200`: one text layer with EXACTLY 200 ASCII characters (200
 *   grapheme clusters) and two character-granularity effect instances
 *   (`typewriter` + `fade-slide`). This is the representative "typical heavy
 *   title" case with a target of < 4 ms mean.
 *
 * - `projectLimits`: a schema-valid project sitting at the documented hard
 *   bounds — 2000-character text (schema max), 16 effect instances (schema
 *   max, all character granularity), and a near-max 7680×4320 canvas. This
 *   lets the final report state the worst-case frames-per-second the engine
 *   sustains at the limits the schema permits.
 *
 * Both fixtures are validated with `ProjectSchema.safeParse` at construction
 * and the parsed (defaults-applied) value is used, so the benchmark can only
 * run against inputs the schema accepts.
 */

import { test } from "vitest";

import { computeFrameState } from "./compute.js";
import { FakeMetricsProvider } from "./metrics.js";
import { ProjectSchema, type Project } from "./schemas/project.js";

/**
 * Parses a project fixture, throwing with a descriptive message if it is not
 * schema-valid. Using `safeParse` (rather than `parse`) keeps the "validate and
 * assert success" contract explicit and surfaces the Zod error on failure.
 */
function buildProject(raw: unknown, label: string): Project {
  const result = ProjectSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `${label} fixture is not schema-valid: ${JSON.stringify(result.error.issues)}`,
    );
  }
  return result.data;
}

// --- project200: 200 ASCII chars, 2 character-granularity effects -----------

// "The quick brown fox " is 20 chars; repeated 10× gives exactly 200 chars.
const TEXT_200 = "The quick brown fox ".repeat(10);
if (TEXT_200.length !== 200) {
  throw new Error(`project200 text must be 200 chars, got ${TEXT_200.length}.`);
}

const project200: Project = buildProject(
  {
    schemaVersion: 1,
    canvas: { width: 1920, height: 1080, fps: 30, durationSeconds: 10 },
    background: "#000000",
    seed: 42,
    layers: [
      {
        id: "layer-200",
        text: TEXT_200,
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0, easing: "linear" },
              { t: 1, value: 1, easing: "easeInOut" },
            ],
          },
        ],
        effectInstances: [
          {
            effectId: "typewriter",
            granularity: "character",
            params: {
              startDelay: 0,
              delayPerCharacter: 0.02,
              direction: "forward",
            },
          },
          {
            effectId: "fade-slide",
            granularity: "character",
            params: {
              durationSeconds: 0.4,
              slideDistance: 24,
              slideAxis: "y",
              delayPerSegment: 0.015,
              easing: "easeOut",
            },
          },
        ],
        fontFamily: "Inter",
        fontSize: 48,
        fontWeight: "700",
        fill: "#ff00aa",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: 1600,
        startSeconds: 0,
        endSeconds: 10,
        anchor: { x: 960, y: 540 },
      },
    ],
  },
  "project200",
);

// --- projectLimits: schema hard limits (2000 chars, 16 effects, max canvas) --

// Schema max text length is 2000 chars. Repeat past 2000 then slice to exactly 2000.
const TEXT_LIMIT = "Resurrection of the Flash-era motion title studio. ".repeat(50).slice(0, 2000);
if (TEXT_LIMIT.length !== 2000) {
  throw new Error(
    `projectLimits text must be 2000 chars, got ${TEXT_LIMIT.length}.`,
  );
}

// 16 character-granularity effect instances — the schema max (effectInstances
// array `.max(16)`), alternating the two built-in effects.
const limitEffects = Array.from({ length: 16 }, (_unused, i) =>
  i % 2 === 0
    ? {
        effectId: "typewriter",
        granularity: "character",
        params: {
          startDelay: 0,
          delayPerCharacter: 0.005,
          direction: "forward",
        },
      }
    : {
        effectId: "fade-slide",
        granularity: "character",
        params: {
          durationSeconds: 0.3,
          slideDistance: 16,
          slideAxis: "x",
          delayPerSegment: 0.004,
          easing: "easeInOut",
        },
      },
);

const projectLimits: Project = buildProject(
  {
    schemaVersion: 1,
    // Near the schema maxima: 7680×4320 canvas, 120 fps, 600s duration.
    canvas: { width: 7680, height: 4320, fps: 120, durationSeconds: 600 },
    background: "#101018",
    seed: 1337,
    layers: [
      {
        id: "layer-limit",
        text: TEXT_LIMIT,
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0, easing: "linear" },
              { t: 1, value: 1, easing: "easeInOut" },
            ],
          },
        ],
        effectInstances: limitEffects,
        fontFamily: "Inter",
        fontSize: 64,
        fontWeight: "700",
        fill: "#ffffff",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: 7000,
        startSeconds: 0,
        endSeconds: 600,
        anchor: { x: 3840, y: 2160 },
      },
    ],
  },
  "projectLimits",
);

// In Vitest 5 the benchmark API is a test-context fixture (`{ bench }`), not a
// top-level `import { bench } from "vitest"`. Each `bench(...)` is registered
// and executed via `.run(...)` inside a `test` that lives in a `*.bench.ts`
// file (matched by `benchmark.include`). The benchmark semantics are unchanged:
// a fresh `new Map()` is created inside each iteration for a cold `layoutCache`,
// and `{ time: 500 }` (a run option in v5) caps each benchmark's sampling
// window.

// Target: < 4 ms mean
test("computeFrameState — 200 chars, 2 effects, cold cache", async ({ bench }) => {
  await bench("computeFrameState — 200 chars, 2 effects, cold cache", () => {
    computeFrameState(project200, 0.5, { metricsProvider: FakeMetricsProvider, layoutCache: new Map() });
  }).run({ time: 500 });
});

test("computeFrameState — hard-limits project, cold cache", async ({ bench }) => {
  await bench("computeFrameState — hard-limits project, cold cache", () => {
    computeFrameState(projectLimits, 0.5, { metricsProvider: FakeMetricsProvider, layoutCache: new Map() });
  }).run({ time: 500 });
});
