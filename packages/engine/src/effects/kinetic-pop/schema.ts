/**
 * Zod schema for the `kinetic-pop` effect's params.
 *
 * `kinetic-pop` pops each group in by scaling up to a single peak `target =
 * max(startScale, 1 + overshoot)` at eased progress `0.6`, then settling to
 * exactly `1`. Every numeric field is `.finite()` with hard min/max bounds.
 * Defaults match the preset catalog entry.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `kinetic-pop` effect. */
export const KineticPopParamsSchema = z.object({
  /** Seconds before the first group begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group pop duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.45),
  /** Per-group stagger in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.05),
  /** Initial scale multiplier at `p = 0`. */
  startScale: z.number().finite().min(0).max(100).default(0.2),
  /** Extra scale added above `1` at the peak. */
  overshoot: z.number().finite().min(0).max(10).default(0.25),
  /** Interpolation curve shaping the rise to the peak. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `kinetic-pop` effect. */
export type KineticPopParams = z.infer<typeof KineticPopParamsSchema>;
