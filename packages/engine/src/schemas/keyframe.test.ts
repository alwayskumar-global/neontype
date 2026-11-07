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
