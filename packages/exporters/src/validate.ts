/**
 * Option validation for the exporters (Req 2.2–2.5, 2.12, 10.5, 14.3–14.5).
 *
 * All validators return a typed `invalid-options` failure (never throw) with a
 * populated `fieldPaths` list, and start no encode. Range checks run in the
 * FIXED order `width, height, durationSeconds, videoBitrate` so the first
 * offending option is deterministic for a given input (Req 2.4).
 */

import type { ExportResult, ExportLimits } from "./types.js";
import { fail } from "./errors.js";

/** Engine canvas bounds (authoritative; mirrors `ProjectSchema`). */
export const WIDTH_MIN = 1;
export const WIDTH_MAX = 7680;
export const HEIGHT_MIN = 1;
export const HEIGHT_MAX = 4320;
export const DURATION_MIN = 0.1;
export const DURATION_MAX = 600;
export const BITRATE_MIN = 100_000;
export const BITRATE_MAX = 100_000_000;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** `#rrggbb` validator used for `backgroundFallback` (Req 2.12). */
export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

function isIntInRange(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

function isFiniteInRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

/** Options that carry a requested output size and (optionally) a bitrate. */
export interface DimensionOptions {
  width: number;
  height: number;
  durationSeconds: number;
  videoBitrate?: number;
}

/**
 * Validates the caller-supplied dimensions / duration / bitrate against the
 * engine canvas bounds, in fixed order (Req 2.2–2.4). `videoBitrate` is checked
 * only when provided. Returns `null` when all are valid, else an
 * `invalid-options` failure naming the first offender.
 */
export function validateDimensionOptions(opts: DimensionOptions): ExportResult | null {
  if (!isIntInRange(opts.width, WIDTH_MIN, WIDTH_MAX)) {
    return fail(
      "invalid-options",
      `width must be an integer in [${WIDTH_MIN}, ${WIDTH_MAX}]`,
      ["width"],
    );
  }
  if (!isIntInRange(opts.height, HEIGHT_MIN, HEIGHT_MAX)) {
    return fail(
      "invalid-options",
      `height must be an integer in [${HEIGHT_MIN}, ${HEIGHT_MAX}]`,
      ["height"],
    );
  }
  if (!isFiniteInRange(opts.durationSeconds, DURATION_MIN, DURATION_MAX)) {
    return fail(
      "invalid-options",
      `durationSeconds must be in [${DURATION_MIN}, ${DURATION_MAX}]`,
      ["durationSeconds"],
    );
  }
  if (
    opts.videoBitrate !== undefined &&
    !isIntInRange(opts.videoBitrate, BITRATE_MIN, BITRATE_MAX)
  ) {
    return fail(
      "invalid-options",
      `videoBitrate must be an integer in [${BITRATE_MIN}, ${BITRATE_MAX}]`,
      ["videoBitrate"],
    );
  }
  return null;
}

/** Validates a `backgroundFallback` option when present (Req 2.12). */
export function validateBackgroundFallback(value: string | undefined): ExportResult | null {
  if (value === undefined) {
    return null;
  }
  if (!isHexColor(value)) {
    return fail(
      "invalid-options",
      "backgroundFallback must be a #rrggbb hex color",
      ["backgroundFallback"],
    );
  }
  return null;
}

/** Rounds an odd dimension up to the next even integer. */
function nextEven(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

/** Result of the MP4 even-dimension rule (Req 2.5). */
export interface EvenDimensions {
  width: number;
  height: number;
}

/**
 * Applies the H.264 even-dimension rule (Req 2.5): round each odd dimension up
 * to the next even integer, then clamp into the canvas bound so the result is
 * an even integer within `[1, 7680]` / `[1, 4320]`. Assumes the inputs already
 * passed `validateDimensionOptions` (so they are in range to begin with).
 */
export function applyEvenDimensionRule(width: number, height: number): EvenDimensions {
  const w = Math.min(nextEven(width), WIDTH_MAX);
  const h = Math.min(nextEven(height), HEIGHT_MAX);
  return { width: w, height: h };
}

/**
 * Validates the output size against the engine bounds and the aspect-ratio
 * rule (Req 14.3–14.5): both dimensions in range, and the output aspect ratio
 * matching the canvas aspect ratio to within 1 pixel on the larger axis.
 * Returns `null` when valid, else an `invalid-options` failure.
 */
export function validateOutputSize(
  output: { width: number; height: number },
  canvas: { width: number; height: number },
): ExportResult | null {
  if (!isIntInRange(output.width, WIDTH_MIN, WIDTH_MAX)) {
    return fail("invalid-options", `output width must be an integer in [${WIDTH_MIN}, ${WIDTH_MAX}]`, ["output.width"]);
  }
  if (!isIntInRange(output.height, HEIGHT_MIN, HEIGHT_MAX)) {
    return fail("invalid-options", `output height must be an integer in [${HEIGHT_MIN}, ${HEIGHT_MAX}]`, ["output.height"]);
  }
  // Aspect check (Req 14.3): the mismatch is measured on the LARGER output axis.
  // The larger axis is whichever output dimension is greater; its expected
  // length is derived from the OTHER axis under the canvas ratio, and the
  // mismatch is the absolute pixel difference there. Accept only when <= 1.
  let mismatch: number;
  if (output.height >= output.width) {
    const expectedHeight = (canvas.height * output.width) / canvas.width;
    mismatch = Math.abs(expectedHeight - output.height);
  } else {
    const expectedWidth = (canvas.width * output.height) / canvas.height;
    mismatch = Math.abs(expectedWidth - output.width);
  }
  if (mismatch > 1) {
    return fail(
      "invalid-options",
      "output aspect ratio must match the canvas aspect ratio within 1 pixel on the larger axis",
      ["output"],
    );
  }
  return null;
}

/**
 * Validates the hard resource limits before encoding (Req 9.5/9.6 range part):
 * `durationSeconds <= maxDurationSeconds`, `frameCount <= maxFrames`, and
 * `width * height <= maxPixels`. Returns `null` when within budget.
 */
export function validateLimits(
  args: { durationSeconds: number; frameCount: number; width: number; height: number },
  limits: ExportLimits,
): ExportResult | null {
  if (args.durationSeconds > limits.maxDurationSeconds) {
    return fail("invalid-options", `durationSeconds exceeds maxDurationSeconds (${limits.maxDurationSeconds})`, ["durationSeconds"]);
  }
  if (args.frameCount > limits.maxFrames) {
    return fail("invalid-options", `frame count ${args.frameCount} exceeds maxFrames (${limits.maxFrames})`, ["limits.maxFrames"]);
  }
  if (args.width * args.height > limits.maxPixels) {
    return fail("invalid-options", `output ${args.width}x${args.height} exceeds maxPixels (${limits.maxPixels})`, ["limits.maxPixels"]);
  }
  return null;
}
