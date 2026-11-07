/**
 * Visual-fixture generation for the Playwright golden-image tests (Task 12.2).
 *
 * This script builds a small set of representative `Project` documents, runs
 * each through the pure `computeFrameState` at a chosen time `t`, and writes the
 * resulting `FrameState` to `tests/visual/fixtures/<name>.json`. The committed
 * fixtures are the ONLY input the `draw-frame.spec.ts` golden-image tests feed
 * to `window.render` (which calls `drawFrame`); the spec never recomputes state.
 *
 * Determinism: fixtures are produced with `FakeMetricsProvider`, so layout
 * geometry is fully reproducible and independent of any browser's font metrics.
 * The browser only decides how the glyphs are rasterised at paint time, which is
 * what the golden image captures.
 *
 * Following the `generate-schemas.ts` pattern, the generation logic is a PURE,
 * exportable function (`generateFixtures`) that touches no disk, plus a
 * `writeFixtures` / `main` pair guarded by the direct-invocation check so the
 * module can be imported without side effects. Node APIs are typed by the local
 * ambient `scripts/node-shims.d.ts`; `tsx` provides the implementations at
 * runtime. This file lives under `scripts/`, not `src/`, so the engine purity
 * ESLint rules do not apply and disk writes are allowed. It still avoids banned
 * time/random calls.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { ProjectSchema, type Project } from "../src/schemas/project.js";
import { computeFrameState, type FrameState } from "../src/compute.js";
import { FakeMetricsProvider } from "../src/metrics.js";

/** One named fixture: the resolved frame plus the time it was computed at. */
interface FixtureSpec {
  name: string;
  project: Project;
  t: number;
}

const CANVAS = { width: 800, height: 450, fps: 30, durationSeconds: 5 } as const;

/**
 * Fixture 1 — single layer, `typewriter` (forward), ASCII text. At `t = 0.35`
 * with `delayPerCharacter = 0.1` the first four characters are revealed and the
 * rest are hidden, so the frame shows a visible partial typewriter state.
 */
function typewriterAsciiProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { ...CANVAS },
    background: "#101018",
    seed: 7,
    layers: [
      {
        id: "typewriter-ascii",
        text: "Hello World",
        tracks: [],
        effectInstances: [
          {
            effectId: "typewriter",
            granularity: "character",
            params: { startDelay: 0, delayPerCharacter: 0.1, direction: "forward" },
          },
        ],
        fontFamily: "Noto Sans",
        fontSize: 48,
        fontWeight: "400",
        fill: "#f5f5ff",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 5,
        anchor: { x: 80, y: 220 },
      },
    ],
  };
}

/**
 * Fixture 2 — single layer, `fade-slide`. At `t = 0.5` with a per-segment
 * `durationSeconds` of 1 and a stagger the leading characters are mid-reveal
 * (partial opacity and a partial slide offset), producing a visibly animated
 * frame.
 */
function fadeSlideProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { ...CANVAS },
    background: "#181024",
    seed: 11,
    layers: [
      {
        id: "fade-slide-ascii",
        text: "Resurrection",
        tracks: [],
        effectInstances: [
          {
            effectId: "fade-slide",
            granularity: "character",
            params: {
              durationSeconds: 1,
              slideDistance: 40,
              slideAxis: "y",
              delayPerSegment: 0.05,
              easing: "easeOut",
            },
          },
        ],
        fontFamily: "Noto Sans",
        fontSize: 44,
        fontWeight: "400",
        fill: "#9cffd6",
        align: "left",
        letterSpacing: 1,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 5,
        anchor: { x: 80, y: 240 },
      },
    ],
  };
}

/**
 * Fixture 3 — single layer, `typewriter` (forward), Tamil text with the
 * `Noto Sans Tamil` family. At `t = 0.25` with `delayPerCharacter = 0.1` the
 * first three grapheme clusters are revealed, exercising non-Latin shaping in
 * the golden image.
 */
function typewriterTamilProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { ...CANVAS },
    background: "#0c141c",
    seed: 23,
    layers: [
      {
        id: "typewriter-tamil",
        text: "வணக்கம்",
        tracks: [],
        effectInstances: [
          {
            effectId: "typewriter",
            granularity: "character",
            params: { startDelay: 0, delayPerCharacter: 0.1, direction: "forward" },
          },
        ],
        fontFamily: "Noto Sans Tamil",
        fontSize: 56,
        fontWeight: "400",
        fill: "#ffd27f",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 5,
        anchor: { x: 80, y: 250 },
      },
    ],
  };
}

/** The three fixture specs, each paired with a representative mid-animation `t`. */
function fixtureSpecs(): FixtureSpec[] {
  return [
    { name: "typewriter-ascii", project: typewriterAsciiProject(), t: 0.35 },
    { name: "fade-slide", project: fadeSlideProject(), t: 0.5 },
    { name: "typewriter-tamil", project: typewriterTamilProject(), t: 0.25 },
  ];
}

/**
 * Produces every fixture `FrameState` in memory, keyed by the relative file name
 * it should be written to. Pure: no filesystem, clock, or randomness.
 *
 * Each project is validated with `ProjectSchema.safeParse` before it is used; an
 * invalid fixture throws here so the error is caught at generation time rather
 * than surfacing as a confusing golden-image mismatch.
 */
export function generateFixtures(): Record<string, FrameState> {
  const out: Record<string, FrameState> = {};

  for (const spec of fixtureSpecs()) {
    const parsed = ProjectSchema.safeParse(spec.project);
    if (!parsed.success) {
      throw new Error(
        `Fixture "${spec.name}" does not satisfy ProjectSchema: ${parsed.error.message}`,
      );
    }

    out[`${spec.name}.json`] = computeFrameState(parsed.data, spec.t, {
      metricsProvider: FakeMetricsProvider,
    });
  }

  return out;
}

/** Absolute path to `packages/engine/tests/visual/fixtures`, from this module. */
function fixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "tests", "visual", "fixtures");
}

/**
 * Writes every generated fixture to `tests/visual/fixtures/`, pretty-printed
 * with 2-space indentation and a trailing newline for stable diffs.
 */
export function writeFixtures(): void {
  const dir = fixturesDir();
  mkdirSync(dir, { recursive: true });

  const fixtures = generateFixtures();
  for (const [fileName, state] of Object.entries(fixtures)) {
    const json = `${JSON.stringify(state, null, 2)}\n`;
    writeFileSync(join(dir, fileName), json, "utf8");
  }
}

/** Script entry point: write all fixtures to disk. */
function main(): void {
  writeFixtures();
}

// Run only when invoked directly as a script, not when imported as a module.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
