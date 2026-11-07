import { describe, expect, it } from "vitest";
import { KeyframeTrackSchema } from "./schemas/keyframe.js";
import { interpolateTrack } from "./interpolate.js";
import type { z } from "zod";

type KeyframeTrack = z.infer<typeof KeyframeTrackSchema>;

/**
 * Builds a validated track via the schema so the tests exercise the exact data
 * shape the engine parses. `safeParse` guarantees strictly-increasing `t`,
 * so the interpolation preconditions hold.
 */
function makeTrack(track: unknown): KeyframeTrack {
  const result = KeyframeTrackSchema.safeParse(track);
  if (!result.success) {
    throw new Error(`invalid track fixture: ${result.error.message}`);
  }
  return result.data;
}

describe("interpolateTrack — boundary semantics", () => {
  const track = makeTrack({
    property: "opacity",
    keyframes: [
      { t: 1, value: 0, easing: "linear" },
      { t: 3, value: 1, easing: "linear" },
    ],
  });

  it("returns the first keyframe's value before the first keyframe", () => {
    expect(interpolateTrack(track, 0)).toBe(0);
  });

  it("returns the last keyframe's value after the last keyframe", () => {
    expect(interpolateTrack(track, 5)).toBe(1);
  });

  it("returns the keyframe's value at an exact keyframe boundary", () => {
    // At the first keyframe's exact time.
    expect(interpolateTrack(track, 1)).toBe(0);
    // At the last keyframe's exact time.
    expect(interpolateTrack(track, 3)).toBe(1);
  });

  it("interpolates linearly at the interval midpoint", () => {
    // Midpoint of t in [1, 3] is t = 2, p = 0.5, linear -> 0.5.
    expect(interpolateTrack(track, 2)).toBeCloseTo(0.5, 10);
  });
});

describe("interpolateTrack — boundary semantics (second numeric property)", () => {
  // A second numeric property (rotation) broadens the before/after/boundary
  // coverage beyond opacity and uses in-range values ([-36000, 36000]).
  const rotationTrack = makeTrack({
    property: "rotation",
    keyframes: [
      { t: 2, value: -90, easing: "linear" },
      { t: 6, value: 90, easing: "linear" },
    ],
  });

  it("returns the first keyframe's value before the first keyframe", () => {
    expect(interpolateTrack(rotationTrack, 0)).toBe(-90);
  });

  it("returns the last keyframe's value after the last keyframe", () => {
    expect(interpolateTrack(rotationTrack, 10)).toBe(90);
  });

  it("returns the keyframe's value at each exact keyframe boundary", () => {
    expect(interpolateTrack(rotationTrack, 2)).toBe(-90);
    expect(interpolateTrack(rotationTrack, 6)).toBe(90);
  });

  it("interpolates linearly at the interval midpoint", () => {
    // t = 4 is the midpoint of [2, 6]: p = 0.5, linear -> -90 + 180*0.5 = 0.
    expect(interpolateTrack(rotationTrack, 4)).toBeCloseTo(0, 10);
  });
});

describe("interpolateTrack — color channel math", () => {
  const colorTrack = makeTrack({
    property: "color",
    keyframes: [
      { t: 0, value: "#000000", easing: "linear" },
      { t: 1, value: "#ffffff", easing: "linear" },
    ],
  });

  it("interpolates #000000 -> #ffffff at the midpoint to #808080", () => {
    // Each channel: 0 + (255 - 0) * 0.5 = 127.5, Math.round(127.5) = 128 = 0x80.
    expect(interpolateTrack(colorTrack, 0.5)).toBe("#808080");
  });

  it("rounds each channel half-up for #000000 -> #010101 at the midpoint", () => {
    // Each channel: 0 + (1 - 0) * 0.5 = 0.5, Math.round(0.5) = 1 = 0x01.
    // Verifies half-up rounding at an exact .5 boundary on every channel.
    const track = makeTrack({
      property: "color",
      keyframes: [
        { t: 0, value: "#000000", easing: "linear" },
        { t: 1, value: "#010101", easing: "linear" },
      ],
    });
    expect(interpolateTrack(track, 0.5)).toBe("#010101");
  });

  it("interpolates a non-symmetric color #204060 -> #4080c0 at the midpoint", () => {
    // Per channel at p = 0.5 (exact integer midpoints, no rounding ambiguity):
    //   R: (0x20 + 0x40) / 2 = (32 + 64) / 2  = 48  = 0x30
    //   G: (0x40 + 0x80) / 2 = (64 + 128) / 2 = 96  = 0x60
    //   B: (0x60 + 0xc0) / 2 = (96 + 192) / 2 = 144 = 0x90
    // -> #306090
    const track = makeTrack({
      property: "color",
      keyframes: [
        { t: 0, value: "#204060", easing: "linear" },
        { t: 2, value: "#4080c0", easing: "linear" },
      ],
    });
    expect(interpolateTrack(track, 1)).toBe("#306090");
  });
});

describe("interpolateTrack — position tuple", () => {
  const positionTrack = makeTrack({
    property: "position",
    keyframes: [
      { t: 0, value: [0, 10], easing: "linear" },
      { t: 2, value: [100, 30], easing: "linear" },
    ],
  });

  it("interpolates each component independently and returns a tuple", () => {
    const result = interpolateTrack(positionTrack, 1) as [number, number];
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBeCloseTo(50, 10);
    expect(result[1]).toBeCloseTo(20, 10);
  });
});

describe("interpolateTrack — step easing discrete levels", () => {
  // Step easing with steps = 4 over a single interval. The interval's start
  // keyframe carries the `step` easing (interpolateTrack uses kf_i.easing for
  // the interval leaving kf_i), so the whole [t=0, t=4] interval is stepped.
  //
  // Property choice: `rotation` with a = 0, b = 3 so the eased levels map to
  // CLEAN INTEGERS. Rotation is in range ([-36000, 36000]) and a single number,
  // which makes the "exactly N discrete values" assertion exact (no float
  // rounding, unlike opacity's 1/3, 2/3 thirds).
  //
  // easing step semantics (easing.ts): for p in [0, 1),
  //   level = min(floor(p * N), N - 1), eased = level / (N - 1), value = a + (b-a)*eased.
  // For p >= 1 the interval end is reached, and interpolateTrack holds the last
  // keyframe value (= b = 3).
  //
  // Times chosen so p = tLocal / 4 lands exactly on 0, 0.25, 0.5, 0.75:
  //   tLocal = 0 -> p = 0.00 -> floor(0) = 0 -> 0/3 -> value 0 + 3*0   = 0
  //   tLocal = 1 -> p = 0.25 -> floor(1) = 1 -> 1/3 -> value 0 + 3*1/3 = 1
  //   tLocal = 2 -> p = 0.50 -> floor(2) = 2 -> 2/3 -> value 0 + 3*2/3 = 2
  //   tLocal = 3 -> p = 0.75 -> floor(3) = 3 -> 3/3 -> value 0 + 3*1   = 3
  //   tLocal = 4 -> hold at last keyframe                              = 3
  // Expected discrete set across p in [0, 1): {0, 1, 2, 3} -> exactly 4 values.
  const steppedTrack = makeTrack({
    property: "rotation",
    keyframes: [
      { t: 0, value: 0, easing: { type: "step", steps: 4 } },
      { t: 4, value: 3, easing: "linear" },
    ],
  });

  it("returns each of the exactly 4 discrete eased values across the interval", () => {
    expect(interpolateTrack(steppedTrack, 0)).toBe(0);
    expect(interpolateTrack(steppedTrack, 1)).toBe(1);
    expect(interpolateTrack(steppedTrack, 2)).toBe(2);
    expect(interpolateTrack(steppedTrack, 3)).toBe(3);
  });

  it("holds the final keyframe value at and after the last keyframe", () => {
    // p >= 1: interpolateTrack holds the last keyframe value.
    expect(interpolateTrack(steppedTrack, 4)).toBe(3);
    expect(interpolateTrack(steppedTrack, 6)).toBe(3);
  });

  it("produces exactly N (= 4) distinct output levels across p in [0, 1)", () => {
    // Sample densely across the interior and confirm the output takes exactly
    // four distinct values — the hallmark of step easing with steps = 4.
    const samples: number[] = [];
    for (let k = 0; k < 40; k++) {
      // tLocal in [0, 4): p in [0, 1), never reaching the end-hold branch.
      const tLocal = (k / 40) * 4;
      samples.push(interpolateTrack(steppedTrack, tLocal) as number);
    }
    const distinct = [...new Set(samples)].sort((x, y) => x - y);
    expect(distinct).toEqual([0, 1, 2, 3]);
  });
});

describe("interpolateTrack — single keyframe", () => {
  const singleTrack = makeTrack({
    property: "scale",
    keyframes: [{ t: 2, value: 1.5, easing: "linear" }],
  });

  it("returns the only keyframe's value for any tLocal", () => {
    expect(interpolateTrack(singleTrack, 0)).toBe(1.5);
    expect(interpolateTrack(singleTrack, 2)).toBe(1.5);
    expect(interpolateTrack(singleTrack, 10)).toBe(1.5);
  });
});
