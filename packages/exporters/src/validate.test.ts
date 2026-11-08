/**
 * Unit tests for option validation (Task 1.4).
 *
 * Covers the inclusive-bound acceptance and one-step-outside rejection of each
 * option, the fixed evaluation order, the even-dimension rounding+clamp, the
 * aspect-ratio-within-1px rule, invalid backgroundFallback, and the ErrorCode
 * closure assertion. Property 3 (validation boundaries) and Property 11 (error
 * code closure) are exercised here as concrete boundary checks.
 */

import { describe, it, expect } from "vitest";

import { ERROR_CODES, type ErrorCode } from "./errors.js";
import {
  validateDimensionOptions,
  validateBackgroundFallback,
  validateOutputSize,
  validateLimits,
  applyEvenDimensionRule,
  isHexColor,
  WIDTH_MIN,
  WIDTH_MAX,
  HEIGHT_MIN,
  HEIGHT_MAX,
  DURATION_MIN,
  DURATION_MAX,
  BITRATE_MIN,
  BITRATE_MAX,
} from "./validate.js";
import { DEFAULT_LIMITS } from "./types.js";

/** Asserts a result is an invalid-options failure naming `field`. */
function expectInvalid(result: ReturnType<typeof validateDimensionOptions>, field: string) {
  expect(result).not.toBeNull();
  expect(result!.ok).toBe(false);
  if (result!.ok === false) {
    expect(result!.error.code).toBe("invalid-options");
    expect(result!.error.fieldPaths).toContain(field);
  }
}

describe("validateDimensionOptions — bounds", () => {
  const base = { width: 1920, height: 1080, durationSeconds: 6, videoBitrate: 4_000_000 };

  it("accepts values at the inclusive bounds", () => {
    expect(validateDimensionOptions({ width: WIDTH_MIN, height: HEIGHT_MIN, durationSeconds: DURATION_MIN, videoBitrate: BITRATE_MIN })).toBeNull();
    expect(validateDimensionOptions({ width: WIDTH_MAX, height: HEIGHT_MAX, durationSeconds: DURATION_MAX, videoBitrate: BITRATE_MAX })).toBeNull();
  });

  it("rejects width one step outside", () => {
    expectInvalid(validateDimensionOptions({ ...base, width: WIDTH_MAX + 1 }), "width");
    expectInvalid(validateDimensionOptions({ ...base, width: WIDTH_MIN - 1 }), "width");
  });

  it("rejects height one step outside", () => {
    expectInvalid(validateDimensionOptions({ ...base, height: HEIGHT_MAX + 1 }), "height");
  });

  it("rejects durationSeconds one step outside", () => {
    expectInvalid(validateDimensionOptions({ ...base, durationSeconds: DURATION_MAX + 0.1 }), "durationSeconds");
    expectInvalid(validateDimensionOptions({ ...base, durationSeconds: 0 }), "durationSeconds");
  });

  it("rejects videoBitrate one step outside when provided", () => {
    expectInvalid(validateDimensionOptions({ ...base, videoBitrate: BITRATE_MAX + 1 }), "videoBitrate");
    expectInvalid(validateDimensionOptions({ ...base, videoBitrate: BITRATE_MIN - 1 }), "videoBitrate");
  });

  it("allows an omitted videoBitrate", () => {
    expect(validateDimensionOptions({ width: 1920, height: 1080, durationSeconds: 6 })).toBeNull();
  });

  it("rejects non-integer width/height", () => {
    expectInvalid(validateDimensionOptions({ ...base, width: 100.5 }), "width");
  });
});

describe("validateDimensionOptions — fixed evaluation order", () => {
  it("names width first when multiple options are invalid", () => {
    const r = validateDimensionOptions({ width: -1, height: -1, durationSeconds: 9999, videoBitrate: 0 });
    expectInvalid(r, "width");
  });

  it("names height when width is valid but height and later are invalid", () => {
    const r = validateDimensionOptions({ width: 1920, height: -1, durationSeconds: 9999, videoBitrate: 0 });
    expectInvalid(r, "height");
  });

  it("names durationSeconds when width/height valid but duration and bitrate invalid", () => {
    const r = validateDimensionOptions({ width: 1920, height: 1080, durationSeconds: 9999, videoBitrate: 0 });
    expectInvalid(r, "durationSeconds");
  });
});

describe("applyEvenDimensionRule", () => {
  it("rounds odd dimensions up to the next even value", () => {
    expect(applyEvenDimensionRule(1921, 1081)).toEqual({ width: 1922, height: 1082 });
  });

  it("leaves even dimensions unchanged", () => {
    expect(applyEvenDimensionRule(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("clamps to the canvas bound when rounding would overflow", () => {
    expect(applyEvenDimensionRule(WIDTH_MAX, HEIGHT_MAX)).toEqual({ width: WIDTH_MAX, height: HEIGHT_MAX });
    // 7679 is odd → nextEven 7680 (== max), within bound.
    expect(applyEvenDimensionRule(7679, 4319)).toEqual({ width: 7680, height: 4320 });
  });
});

describe("validateBackgroundFallback", () => {
  it("accepts a valid #rrggbb and undefined", () => {
    expect(validateBackgroundFallback(undefined)).toBeNull();
    expect(validateBackgroundFallback("#000000")).toBeNull();
    expect(validateBackgroundFallback("#A1b2C3")).toBeNull();
  });

  it("rejects an invalid hex", () => {
    expectInvalid(validateBackgroundFallback("red"), "backgroundFallback");
    expectInvalid(validateBackgroundFallback("#12"), "backgroundFallback");
    expectInvalid(validateBackgroundFallback("#1234567"), "backgroundFallback");
  });

  it("isHexColor matches the #rrggbb pattern", () => {
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("#ABCDEF")).toBe(true);
    expect(isHexColor("#xyzxyz")).toBe(false);
  });
});

describe("validateOutputSize — aspect rule", () => {
  const canvas = { width: 1920, height: 1080 };

  it("accepts an exactly-matching aspect ratio (scaled)", () => {
    expect(validateOutputSize({ width: 1280, height: 720 }, canvas)).toBeNull();
    expect(validateOutputSize({ width: 1920, height: 1080 }, canvas)).toBeNull();
  });

  it("rejects a mismatched aspect ratio beyond 1px", () => {
    const r = validateOutputSize({ width: 1000, height: 1000 }, canvas);
    expectInvalid(r, "output");
  });

  it("rejects an out-of-range output dimension", () => {
    expectInvalid(validateOutputSize({ width: WIDTH_MAX + 1, height: 1080 }, canvas), "output.width");
  });
});

describe("validateLimits", () => {
  it("accepts within-budget exports", () => {
    expect(validateLimits({ durationSeconds: 6, frameCount: 180, width: 1920, height: 1080 }, DEFAULT_LIMITS)).toBeNull();
  });

  it("rejects over maxDurationSeconds / maxFrames / maxPixels", () => {
    expectInvalid(validateLimits({ durationSeconds: 601, frameCount: 180, width: 1920, height: 1080 }, DEFAULT_LIMITS), "durationSeconds");
    expectInvalid(validateLimits({ durationSeconds: 6, frameCount: 18001, width: 1920, height: 1080 }, DEFAULT_LIMITS), "limits.maxFrames");
    expectInvalid(validateLimits({ durationSeconds: 6, frameCount: 180, width: 7680, height: 4320 }, { ...DEFAULT_LIMITS, maxPixels: 1000 }), "limits.maxPixels");
  });
});

describe("ErrorCode closure (Property 11)", () => {
  it("has exactly the 12 listed members, unique", () => {
    const expected: ErrorCode[] = [
      "browser-unsupported", "blur-unsupported", "cancelled", "out-of-memory",
      "invalid-options", "audio-decode-failed", "font-decode-failed", "font-not-ready",
      "empty-frame-range", "encoder-failure", "muxer-failure", "project-invalid",
    ];
    expect(ERROR_CODES.length).toBe(12);
    expect(new Set(ERROR_CODES).size).toBe(12);
    expect([...ERROR_CODES].sort()).toEqual([...expected].sort());
  });
});
