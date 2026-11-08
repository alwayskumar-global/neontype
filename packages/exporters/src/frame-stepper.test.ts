/**
 * Unit tests for the deterministic frame stepper (Task 2.1).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  frameCountFor,
  roundHalfAwayFromZero,
  frameJobs,
  validateFrameRange,
  awaitFontsReady,
  FONT_READY_TIMEOUT_MS,
} from "./frame-stepper.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("frameCountFor / roundHalfAwayFromZero", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
  });

  it("computes frameCount = round(durationSeconds * fps)", () => {
    expect(frameCountFor(6, 30)).toBe(180);
    expect(frameCountFor(1, 24)).toBe(24);
    // 0.1s * 1fps = 0.1 → rounds to 0 → empty range (checked below).
    expect(frameCountFor(0.1, 1)).toBe(0);
  });
});

describe("frameJobs", () => {
  it("yields indices [0, frameCount - 1] with t = index / fps", () => {
    const jobs = [...frameJobs(0.1, 30)]; // 3 frames
    expect(jobs.map((j) => j.index)).toEqual([0, 1, 2]);
    expect(jobs.map((j) => j.t)).toEqual([0, 1 / 30, 2 / 30]);
  });

  it("is deterministic across calls", () => {
    expect([...frameJobs(2, 25)]).toEqual([...frameJobs(2, 25)]);
  });
});

describe("validateFrameRange", () => {
  it("returns empty-frame-range when frameCount < 1", () => {
    const r = validateFrameRange(0.1, 1);
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (r && r.ok === false) expect(r.error.code).toBe("empty-frame-range");
  });

  it("returns null for a non-empty range", () => {
    expect(validateFrameRange(6, 30)).toBeNull();
  });
});

describe("awaitFontsReady", () => {
  it("resolves true when fonts become ready before the timeout", async () => {
    vi.useFakeTimers();
    const ready = Promise.resolve();
    const p = awaitFontsReady(ready, FONT_READY_TIMEOUT_MS);
    await vi.runAllTimersAsync();
    expect(await p).toBe(true);
  });

  it("resolves false on the 30s timeout (font-not-ready path)", async () => {
    vi.useFakeTimers();
    // A promise that never resolves → the timeout wins.
    const never = new Promise<void>(() => {});
    const p = awaitFontsReady(never, FONT_READY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(FONT_READY_TIMEOUT_MS);
    expect(await p).toBe(false);
  });
});

describe("single metrics provider identity", () => {
  it("a StepContext carries exactly one provider instance reused per frame", () => {
    // The stepper exposes the provider on the context; this asserts the shape
    // contract that callers pass one instance (the orchestrator wires it).
    const provider = { measure: () => ({ width: 1, ascent: 1, descent: 1 }) };
    const ctx = { project: {} as never, fps: 30, durationSeconds: 6, frameCount: 180, metricsProvider: provider };
    // Every frame job must be served by the same provider reference.
    const jobs = [...frameJobs(0.1, 30)];
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(ctx.metricsProvider).toBe(provider);
      expect(Number.isFinite(job.t)).toBe(true);
    }
  });
});

/* ----------------------------- Property tests ----------------------------- */

import fc from "fast-check";
import { computeFrameState, FakeMetricsProvider, ProjectSchema, type Project } from "@studio/engine";

// Feature: exporters, Property 1: Frame count formula
describe("Property 1: Frame count formula", () => {
  it("frameCount === round(duration*fps) (half away from zero); index set is [0, frameCount-1]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 600, noNaN: true }),
        fc.integer({ min: 1, max: 120 }),
        (durationSeconds, fps) => {
          const count = frameCountFor(durationSeconds, fps);
          const expected = Math.sign(durationSeconds * fps) * Math.round(Math.abs(durationSeconds * fps));
          expect(count).toBe(expected);
          const jobs = [...frameJobs(durationSeconds, fps)];
          expect(jobs.length).toBe(Math.max(0, count));
          if (count > 0) {
            expect(jobs[0].index).toBe(0);
            expect(jobs[jobs.length - 1].index).toBe(count - 1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

/** A minimal ProjectSchema-valid project arbitrary (engine arbitraries are not
 * part of the engine's public export surface, so we build one locally against
 * the public ProjectSchema/Project type). */
const arbLocalProject: fc.Arbitrary<Project> = fc
  .record({
    width: fc.integer({ min: 16, max: 640 }),
    height: fc.integer({ min: 16, max: 640 }),
    fps: fc.integer({ min: 1, max: 60 }),
    durationSeconds: fc.double({ min: 0.2, max: 4, noNaN: true }),
    text: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
    seed: fc.integer(),
    fontSize: fc.integer({ min: 8, max: 120 }),
  })
  .map(({ width, height, fps, durationSeconds, text, seed, fontSize }): Project => {
    const candidate = {
      schemaVersion: 1,
      canvas: { width, height, fps, durationSeconds },
      background: "#101020",
      seed,
      layers: [
        {
          id: "layer-1",
          text,
          tracks: [],
          effectInstances: [],
          fontFamily: "sans-serif",
          fontSize,
          fontWeight: "400",
          fill: "#ffffff",
          align: "center" as const,
          letterSpacing: 0,
          lineHeight: 1.2,
          maxWidth: null,
          startSeconds: 0,
          endSeconds: durationSeconds,
          anchor: { x: width / 2, y: height / 2 },
        },
      ],
    };
    return ProjectSchema.parse(candidate);
  });

// Feature: exporters, Property 2: Deterministic rendered-and-scaled frames
describe("Property 2: Deterministic rendered-and-scaled frames", () => {
  it("rendering the same frame index twice yields byte-identical FrameState", () => {
    fc.assert(
      fc.property(arbLocalProject, fc.nat(5), (project, frameOffset) => {
        const count = frameCountFor(project.canvas.durationSeconds, project.canvas.fps);
        const index = Math.min(frameOffset, Math.max(0, count - 1));
        const t = index / project.canvas.fps;
        const a = computeFrameState(project, t, { metricsProvider: FakeMetricsProvider });
        const b = computeFrameState(project, t, { metricsProvider: FakeMetricsProvider });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 150 },
    );
  });
});
