import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { timeToX, xToTime } from "./timemap.js";

describe("timemap (unit)", () => {
  it("maps endpoints", () => {
    expect(timeToX(0, 500, 5)).toBe(0);
    expect(timeToX(5, 500, 5)).toBe(500);
    expect(xToTime(0, 500, 5)).toBe(0);
    expect(xToTime(500, 500, 5)).toBe(5);
  });
  it("clamps out-of-range", () => {
    expect(timeToX(-1, 500, 5)).toBe(0);
    expect(timeToX(10, 500, 5)).toBe(500);
    expect(xToTime(-10, 500, 5)).toBe(0);
    expect(xToTime(9999, 500, 5)).toBe(5);
  });
});

// Feature: studio, Property 2: Time-pixel round-trip
describe("Property 2: Time-pixel round-trip", () => {
  it("xToTime(timeToX(t)) ~= t within one pixel-equivalent", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 600, noNaN: true }),
        fc.integer({ min: 1, max: 4000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (durationSeconds, axisWidthPx, frac) => {
          const t = frac * durationSeconds;
          const back = xToTime(timeToX(t, axisWidthPx, durationSeconds), axisWidthPx, durationSeconds);
          // One pixel corresponds to durationSeconds/axisWidthPx seconds.
          const onePixelSeconds = durationSeconds / axisWidthPx;
          expect(Math.abs(back - t)).toBeLessThanOrEqual(onePixelSeconds + 1e-9);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("timeToX(xToTime(x)) ~= x within one pixel for integer x", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 600, noNaN: true }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 0, max: 4000 }),
        (durationSeconds, axisWidthPx, xRaw) => {
          const x = Math.min(axisWidthPx, xRaw);
          const back = timeToX(xToTime(x, axisWidthPx, durationSeconds), axisWidthPx, durationSeconds);
          expect(Math.abs(back - x)).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
      { numRuns: 200 },
    );
  });
});
