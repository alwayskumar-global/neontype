/**
 * Unit tests for the shared effect helpers (`clamp`, `staggeredProgress`).
 *
 * The key behavioural guarantee beyond ordinary clamping is that `clamp`
 * normalizes `-0` to `+0`, so effect outputs match the exact identity state
 * (`+0`, verified via `Object.is`) rather than leaking a `-0`.
 */

import { describe, it, expect } from "vitest";

import { clamp, staggeredProgress } from "./shared.js";

describe("shared.clamp", () => {
  it("clamps into [lo, hi]", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("normalizes -0 to +0 (Object.is)", () => {
    expect(Object.is(clamp(-0, -10, 10), 0)).toBe(true);
    // A computation that produces -0 (negative * 0) is normalized too.
    expect(Object.is(clamp(-3 * 0, -10, 10), 0)).toBe(true);
  });
});

describe("shared.staggeredProgress", () => {
  it("is 0 before start, 1 at/after completion, linear in between", () => {
    // startDelay 0, groupIndex 0, delay 0, duration 2.
    expect(staggeredProgress(0, 0, 0, 0, 2)).toBe(0);
    expect(staggeredProgress(1, 0, 0, 0, 2)).toBe(0.5);
    expect(staggeredProgress(2, 0, 0, 0, 2)).toBe(1);
    expect(staggeredProgress(100, 0, 0, 0, 2)).toBe(1);
  });

  it("staggers by groupIndex * delayPerGroup", () => {
    // group 2 starts at t = 0 + 2*0.5 = 1, completes at 1 + duration(1) = 2.
    expect(staggeredProgress(1, 0, 2, 0.5, 1)).toBe(0);
    expect(staggeredProgress(2, 0, 2, 0.5, 1)).toBe(1);
  });
});
