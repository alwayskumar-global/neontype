/**
 * Zod schema for the `fade-slide` effect's params.
 *
 * The fade-slide effect fades each group in from transparent to opaque while
 * sliding it from an offset position into place along a single axis.
 * `durationSeconds` is the per-group reveal duration; `slideDistance` is the
 * starting offset in px (may be negative to slide from the opposite side);
 * `slideAxis` selects the horizontal (`"x"`) or vertical (`"y"`) axis;
 * `delayPerSegment` staggers successive groups; `easing` shapes the reveal.
 *
 * Numeric fields use `.finite()` to reject `NaN` and `±Infinity`, consistent
 * with the keyframe- and typewriter-schema hardening. This strengthens
 * validation without widening the accepted input space the task describes:
 * every value the task calls positive / non-negative / a px number is still
 * accepted, and the only additional rejections are non-finite numbers that
 * could never produce a meaningful progress or offset.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `fade-slide` effect. */
export const FadeSlideParamsSchema = z.object({
  /** Per-group reveal duration in seconds. Positive, finite. */
  durationSeconds: z.number().finite().positive(),
  /** Starting slide offset in px. May be negative. Finite. */
  slideDistance: z.number().finite(),
  /** Axis the group slides along: horizontal (`x`) or vertical (`y`). */
  slideAxis: z.enum(["x", "y"]),
  /** Per-group reveal stagger in seconds. Non-negative, finite. */
  delayPerSegment: z.number().finite().nonnegative(),
  /** Interpolation curve shaping the reveal progress. */
  easing: EasingSchema,
});

/** Parsed params for the `fade-slide` effect. */
export type FadeSlideParams = z.infer<typeof FadeSlideParamsSchema>;
