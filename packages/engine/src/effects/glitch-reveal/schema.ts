/**
 * Zod schema for the `glitch-reveal` effect's params.
 *
 * `glitch-reveal` reveals each group with a brief jittered distortion whose
 * magnitude eases to 0. Because the per-segment PRNG is derived fresh per frame
 * (not time-dependent), the jitter is quantized into `steps` discrete time
 * cells: the step index `k` selects how many PRNG values to draw, and the last
 * two drives the offset — so the jitter changes across steps while staying
 * deterministic.
 *
 * Every numeric field is `.finite()` with hard min/max bounds; `steps` is an
 * integer in `[1, 30]`. Defaults match the preset catalog entry.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `glitch-reveal` effect. */
export const GlitchRevealParamsSchema = z.object({
  /** Seconds before the first group begins revealing. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group reveal duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.5),
  /** Per-group reveal stagger in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.04),
  /** Maximum jitter offset in px on each axis at `p = 0`. */
  maxOffset: z.number().finite().min(0).max(2000).default(18),
  /** Number of discrete jitter steps across the reveal duration. */
  steps: z.number().int().finite().min(1).max(30).default(8),
  /** Interpolation curve shaping the reveal/jitter decay. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `glitch-reveal` effect. */
export type GlitchRevealParams = z.infer<typeof GlitchRevealParamsSchema>;
