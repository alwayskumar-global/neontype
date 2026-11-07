/**
 * Zod schema for the `rotate-drop` effect's params.
 *
 * `rotate-drop` drops each group into place from an offset while rotating to
 * upright: opacity eases `0 → 1`, the drop offset eases `dropDistance → 0`, and
 * rotation eases `startRotation → 0`. Every numeric field is `.finite()` with
 * hard min/max bounds. Defaults match the preset catalog.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `rotate-drop` effect. */
export const RotateDropParamsSchema = z.object({
  /** Seconds before the first group begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group drop duration in seconds. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(0.5),
  /** Per-group stagger in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.05),
  /** Initial vertical drop offset in px (eases to 0). */
  dropDistance: z.number().finite().min(-32000).max(32000).default(-120),
  /** Initial rotation in degrees (eases to 0). */
  startRotation: z.number().finite().min(-36000).max(36000).default(-90),
  /** Interpolation curve shaping the drop/rotation. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `rotate-drop` effect. */
export type RotateDropParams = z.infer<typeof RotateDropParamsSchema>;
