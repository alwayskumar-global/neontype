/**
 * Zod schema for the `scale-bounce` effect's params.
 *
 * `scale-bounce` bounces each group in with a damped overshoot in scale that
 * settles to exactly `1`. For `bounces >= 1` the scale follows a damped cosine
 * with exactly `bounces` overshoots above `1`; for `bounces == 0` it rises
 * monotonically with no overshoot. Every numeric field is `.finite()` with hard
 * min/max bounds; `bounces` is an integer in `[0, 10]`. Defaults match the
 * preset catalog.
 */

import { z } from "zod";

/** Params accepted by the `scale-bounce` effect. */
export const ScaleBounceParamsSchema = z.object({
  /** Seconds before the first group begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group bounce duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.6),
  /** Per-group stagger in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.05),
  /** Initial scale multiplier at `p = 0`. */
  startScale: z.number().finite().min(0).max(100).default(0),
  /** Number of damped overshoots above 1 (0 → monotone rise, no overshoot). */
  bounces: z.number().int().finite().min(0).max(10).default(2),
});

/** Parsed params for the `scale-bounce` effect. */
export type ScaleBounceParams = z.infer<typeof ScaleBounceParamsSchema>;
