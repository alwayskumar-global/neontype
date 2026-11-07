/**
 * Zod schema for the `blur-in` effect's params.
 *
 * `blur-in` brings each group into focus from a blurred, transparent start:
 * opacity eases `0 → 1` while blur eases `startBlur → 0`. `startDelay` offsets
 * when the reveal begins, `delayPerGroup` staggers successive groups, and
 * `easing` shapes the reveal progress.
 *
 * Every numeric field uses `.finite()` plus a hard min AND max bound, so no
 * value can ever push an override outside the `drawFrame` hardening ranges, and
 * `NaN`/`±Infinity` are rejected. Defaults match the preset catalog entry.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `blur-in` effect. */
export const BlurInParamsSchema = z.object({
  /** Seconds before the first group begins revealing. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group reveal duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.6),
  /** Initial blur radius in px (eases to 0). */
  startBlur: z.number().finite().min(0).max(1000).default(12),
  /** Per-group reveal stagger in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.05),
  /** Interpolation curve shaping the reveal progress. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `blur-in` effect. */
export type BlurInParams = z.infer<typeof BlurInParamsSchema>;
