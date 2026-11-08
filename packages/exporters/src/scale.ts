/**
 * Uniform output scaling (Req 14).
 *
 * Frames are always rendered at the project canvas size, then — when the
 * requested output size differs — resampled by a SINGLE uniform scale factor
 * `outputWidth / canvasWidth` on both axes, exactly filling the output with no
 * crop, letterbox, pillarbox, or bars. The aspect-ratio-within-1px and
 * output-range rules are enforced via `validate.ts` BEFORE any scale is applied,
 * identically for every format. This module holds the pure decision; the actual
 * pixel resample is a `drawImage` in the browser draw path.
 */

import type { ExportResult } from "./types.js";
import { validateOutputSize } from "./validate.js";

/** The resolved scaling plan for an export. */
export interface ScalePlan {
  canvasWidth: number;
  canvasHeight: number;
  outputWidth: number;
  outputHeight: number;
  /** `outputWidth / canvasWidth`; `1` when sizes match. */
  scale: number;
  /** `true` when a resample step is needed (output differs from canvas). */
  needsScaling: boolean;
}

/**
 * Resolves the scaling plan. Returns a failure `ExportResult` when the output
 * size is out of range or its aspect ratio does not match the canvas within 1
 * pixel (Req 14.3–14.5); otherwise a `ScalePlan`. When `output` is omitted the
 * plan renders at canvas size with no scaling (Req 14.1).
 */
export function resolveScalePlan(
  canvas: { width: number; height: number },
  output?: { width: number; height: number },
): ExportResult | ScalePlan {
  if (output === undefined || (output.width === canvas.width && output.height === canvas.height)) {
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      outputWidth: canvas.width,
      outputHeight: canvas.height,
      scale: 1,
      needsScaling: false,
    };
  }

  const invalid = validateOutputSize(output, canvas);
  if (invalid !== null) {
    return invalid;
  }

  return {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    outputWidth: output.width,
    outputHeight: output.height,
    scale: output.width / canvas.width,
    needsScaling: true,
  };
}

/** Narrows `resolveScalePlan`'s union to the success (`ScalePlan`) case. */
export function isScalePlan(value: ExportResult | ScalePlan): value is ScalePlan {
  return (value as ScalePlan).scale !== undefined;
}
