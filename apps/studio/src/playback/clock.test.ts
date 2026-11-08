import { describe, it, expect } from "vitest";
import { wrapTime } from "./clock.js";

describe("wrapTime", () => {
  it("clamps when not looping", () => {
    expect(wrapTime(-1, 5, false)).toBe(0);
    expect(wrapTime(7, 5, false)).toBe(5);
    expect(wrapTime(3, 5, false)).toBe(3);
  });
  it("wraps when looping", () => {
    expect(wrapTime(6, 5, true)).toBe(1);
    expect(wrapTime(5, 5, true)).toBe(0);
    expect(wrapTime(2, 5, true)).toBe(2);
  });
  it("handles zero duration", () => {
    expect(wrapTime(3, 0, true)).toBe(0);
    expect(wrapTime(3, 0, false)).toBe(0);
  });
});
