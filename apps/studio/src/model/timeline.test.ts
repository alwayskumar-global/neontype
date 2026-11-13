import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { dragTiming, nudgeTiming, toFrames, toSeconds, pxToSeconds, lastFrame, type TimingKind } from "./timeline.js";

const KINDS: TimingKind[] = ["move", "start", "end"];

describe("timeline math (unit)", () => {
  it("rounds half away from zero and converts back to 1e-6", () => {
    expect(toFrames(0.5, 1)).toBe(1);
    expect(toFrames(-0.5, 1)).toBe(-1);
    expect(toSeconds(1, 3)).toBe(0.333333);
  });
  it("move keeps length and clamps inside [0, duration]", () => {
    const t = { startSeconds: 1, endSeconds: 2 };
    expect(dragTiming("move", t, 15, 30, 6)).toEqual({ startSeconds: 1.5, endSeconds: 2.5 });
    expect(dragTiming("move", t, -999, 30, 6)).toEqual({ startSeconds: 0, endSeconds: 1 });
    expect(dragTiming("move", t, 9999, 30, 6)).toEqual({ startSeconds: 5, endSeconds: 6 });
  });
  it("start trim keeps >= 1 frame and never passes the out-point", () => {
    const t = { startSeconds: 1, endSeconds: 2 };
    expect(dragTiming("start", t, 9999, 30, 6)).toEqual({ startSeconds: toSeconds(59, 30), endSeconds: 2 });
    expect(dragTiming("start", t, -9999, 30, 6)).toEqual({ startSeconds: 0, endSeconds: 2 });
  });
  it("end trim keeps >= 1 frame and never exceeds the duration", () => {
    const t = { startSeconds: 1, endSeconds: 2 };
    expect(dragTiming("end", t, -9999, 30, 6)).toEqual({ startSeconds: 1, endSeconds: toSeconds(31, 30) });
    expect(dragTiming("end", t, 9999, 30, 6)).toEqual({ startSeconds: 1, endSeconds: 6 });
  });
  it("snaps off-grid input onto the grid even with a zero delta", () => {
    const r = dragTiming("move", { startSeconds: 1.01, endSeconds: 2.02 }, 0, 30, 6);
    expect(toFrames(r.startSeconds, 30) / 30).toBeCloseTo(r.startSeconds, 5);
    expect(r.endSeconds).toBeGreaterThan(r.startSeconds);
  });
  it("returns the input unchanged when the duration is shorter than one frame", () => {
    const t = { startSeconds: 0, endSeconds: 0.1 };
    expect(lastFrame(0.1, 1)).toBe(0);
    expect(dragTiming("end", t, 5, 1, 0.1)).toBe(t);
  });
  it("treats a non-finite delta as 0 and truncates fractions", () => {
    const t = { startSeconds: 1, endSeconds: 2 };
    expect(dragTiming("move", t, Number.NaN, 30, 6)).toEqual(t);
    expect(dragTiming("move", t, 1.9, 30, 6)).toEqual(dragTiming("move", t, 1, 30, 6));
  });
  it("nudgeTiming equals a drag by the same frames", () => {
    const t = { startSeconds: 1, endSeconds: 2 };
    expect(nudgeTiming("end", t, 10, 30, 6)).toEqual(dragTiming("end", t, 10, 30, 6));
  });
  it("pxToSeconds snaps to a frame and clamps to the last frame", () => {
    const g = { axisWidthPx: 600, durationSeconds: 6, fps: 30 };
    expect(pxToSeconds(0, g)).toBe(0);
    expect(pxToSeconds(600, g)).toBe(6);
    expect(pxToSeconds(1234, g)).toBe(6);
    expect(pxToSeconds(101, g)).toBe(toSeconds(toFrames(1.01, 30), 30));
  });
});

// Feature: studio, Property 8: Timing drag stays on the frame grid
describe("Property 8: timing drag stays on the frame grid", () => {
  it("output is on the grid, inside [0, duration], length >= 1 frame, move keeps length", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KINDS),
        fc.integer({ min: 1, max: 120 }),
        fc.integer({ min: 2, max: 600 }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.integer({ min: -100000, max: 100000 }),
        (kind, fps, durFrames, a, b, delta) => {
          const duration = durFrames / fps;
          const start = { startSeconds: Math.min(a, b) % duration, endSeconds: Math.max(a, b) % duration + 0.001 };
          const out = dragTiming(kind, start, delta, fps, duration);
          const fs = toFrames(out.startSeconds, fps);
          const fe = toFrames(out.endSeconds, fps);
          expect(toSeconds(fs, fps)).toBe(out.startSeconds);
          expect(toSeconds(fe, fps)).toBe(out.endSeconds);
          expect(out.startSeconds).toBeGreaterThanOrEqual(0);
          expect(out.endSeconds).toBeLessThanOrEqual(duration + 1e-6);
          expect(fe - fs).toBeGreaterThanOrEqual(1);
          if (kind === "move") {
            const base = dragTiming("move", start, 0, fps, duration);
            expect(fe - fs).toBe(toFrames(base.endSeconds, fps) - toFrames(base.startSeconds, fps));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
