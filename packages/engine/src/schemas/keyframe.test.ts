import { describe, expect, it } from "vitest";
import { KeyframeTrackSchema } from "./keyframe.js";

describe("KeyframeTrackSchema — cross-field validation", () => {
  it("accepts a valid track with strictly increasing t and matching value types", () => {
    const result = KeyframeTrackSchema.safeParse({
      property: "opacity",
      keyframes: [
        { t: 0, value: 0, easing: "linear" },
        { t: 1, value: 1, easing: "easeInOut" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a track whose keyframe t values are not strictly increasing", () => {
    const result = KeyframeTrackSchema.safeParse({
      property: "opacity",
      keyframes: [
        { t: 0, value: 0, easing: "linear" },
        { t: 0, value: 1, easing: "linear" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a track whose keyframe value type mismatches the property", () => {
    // property is "position" (expects a [x, y] tuple) but value is a number.
    const result = KeyframeTrackSchema.safeParse({
      property: "position",
      keyframes: [{ t: 0, value: 5, easing: "linear" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid position track with tuple values and a color track with hex values", () => {
    const position = KeyframeTrackSchema.safeParse({
      property: "position",
      keyframes: [
        { t: 0, value: [0, 0], easing: "linear" },
        { t: 2, value: [10, 20], easing: "easeOut" },
      ],
    });
    const color = KeyframeTrackSchema.safeParse({
      property: "color",
      keyframes: [
        { t: 0, value: "#000000", easing: "linear" },
        { t: 1, value: "#ffffff", easing: "linear" },
      ],
    });
    expect(position.success).toBe(true);
    expect(color.success).toBe(true);
  });
});

describe("KeyframeTrackSchema — per-property numeric bounds (R1.4 + guards)", () => {
  const track = (property: string, value: unknown) =>
    KeyframeTrackSchema.safeParse({
      property,
      keyframes: [{ t: 0, value, easing: "linear" }],
    });

  // position: each axis in [-32000, 32000]
  it("accepts position at the bounds", () => {
    expect(track("position", [-32000, 32000]).success).toBe(true);
    expect(track("position", [32000, -32000]).success).toBe(true);
  });
  it("rejects position just over the bounds", () => {
    expect(track("position", [32001, 0]).success).toBe(false);
    expect(track("position", [0, -32001]).success).toBe(false);
  });

  // scale: strictly positive, max 100
  it("accepts scale at the max bound", () => {
    expect(track("scale", 100).success).toBe(true);
  });
  it("rejects scale over max, zero, and negative", () => {
    expect(track("scale", 100.0001).success).toBe(false);
    expect(track("scale", 0).success).toBe(false);
    expect(track("scale", -1).success).toBe(false);
  });

  // rotation: [-36000, 36000] (hostile-input guard, NOT in R1.4)
  it("accepts rotation at the bounds", () => {
    expect(track("rotation", -36000).success).toBe(true);
    expect(track("rotation", 36000).success).toBe(true);
  });
  it("rejects rotation just over the bounds", () => {
    expect(track("rotation", 36000.0001).success).toBe(false);
    expect(track("rotation", -36000.0001).success).toBe(false);
  });

  // opacity: [0, 1]
  it("accepts opacity at the bounds", () => {
    expect(track("opacity", 0).success).toBe(true);
    expect(track("opacity", 1).success).toBe(true);
  });
  it("rejects opacity just over the bounds", () => {
    expect(track("opacity", 1.0001).success).toBe(false);
    expect(track("opacity", -0.0001).success).toBe(false);
  });

  // blur: [0, 1000] (max is a hostile-input guard, NOT in R1.4)
  it("accepts blur at the bounds", () => {
    expect(track("blur", 0).success).toBe(true);
    expect(track("blur", 1000).success).toBe(true);
  });
  it("rejects blur just over the bounds", () => {
    expect(track("blur", 1000.0001).success).toBe(false);
    expect(track("blur", -0.0001).success).toBe(false);
  });

  // finiteness: NaN and Infinity are rejected
  it("rejects a non-finite rotation value (NaN)", () => {
    expect(track("rotation", Number.NaN).success).toBe(false);
  });
  it("rejects a non-finite blur value (Infinity)", () => {
    expect(track("blur", Number.POSITIVE_INFINITY).success).toBe(false);
  });
});
