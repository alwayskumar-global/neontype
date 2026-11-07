/**
 * Zod schema for the `letter-spread` effect's params.
 *
 * `letter-spread` opens each group outward from its final layout and settles
 * back, approximating letter spacing (which `SegmentOverrides` cannot express
 * directly) via a per-group additive `positionOffset` along one axis. Every
 * numeric field is `.finite()` with hard min/max bounds. Defaults match the
 * preset catalog entry.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `letter-spread` effect. */
export const LetterSpreadParamsSchema = z.object({
  /** Seconds before the spread begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Spread duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.5),
  /** Extra spacing between adjacent groups at the start, in px (may be negative). */
  spreadDistance: z.number().finite().min(-2000).max(2000).default(24),
  /** Axis the spread opens along. */
  axis: z.enum(["x", "y"]).default("x"),
  /** Interpolation curve shaping the settle. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `letter-spread` effect. */
export type LetterSpreadParams = z.infer<typeof LetterSpreadParamsSchema>;
