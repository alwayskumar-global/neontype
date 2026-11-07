import { describe, expect, it } from "vitest";
import { FakeMetricsProvider, type FontSpec } from "./metrics.js";

describe("FakeMetricsProvider", () => {
  it('measures "Hello" at fontSize 16 using the fixed-advance formula', () => {
    const fontSpec: FontSpec = {
      fontFamily: "sans-serif",
      fontSize: 16,
      fontWeight: "400",
      letterSpacing: 0,
    };
    expect(FakeMetricsProvider.measure("Hello", fontSpec)).toEqual({
      width: 48,
      ascent: 12.8,
      descent: 3.2,
    });
  });

  it("returns zero width for an empty string", () => {
    const fontSpec: FontSpec = {
      fontFamily: "sans-serif",
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: 2,
    };
    expect(FakeMetricsProvider.measure("", fontSpec)).toEqual({
      width: 0,
      ascent: 16,
      descent: 4,
    });
  });

  it("scales width, ascent, and descent with fontSize", () => {
    const fontSpec: FontSpec = {
      fontFamily: "monospace",
      fontSize: 10,
      fontWeight: "400",
      letterSpacing: 0,
    };
    expect(FakeMetricsProvider.measure("abc", fontSpec)).toEqual({
      width: 18,
      ascent: 8,
      descent: 2,
    });
  });
});
