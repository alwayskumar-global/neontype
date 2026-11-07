/**
 * Zod schema for the `line-wipe` effect's params.
 *
 * `line-wipe` sweeps a reveal across the groups in order, approximating a
 * continuous clip wipe (which `SegmentOverrides` cannot express) with a
 * per-group opacity threshold plus a short per-group fade. Every numeric field
 * is `.finite()` with hard min/max bounds. Defaults match the preset catalog.
 */

import { z } from "zod";

import { EasingSchema } from "../../schemas/keyframe.js";

/** Params accepted by the `line-wipe` effect. */
export const LineWipeParamsSchema = z.object({
  /** Seconds before the sweep begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Per-group reveal stagger controlling sweep speed, in seconds. */
  delayPerGroup: z.number().finite().min(0).max(60).default(0.05),
  /** Per-group fade duration in seconds (0 → hard step reveal). */
  fadeSeconds: z.number().finite().min(0).max(60).default(0.12),
  /** Sweep direction across the groups. */
  direction: z.enum(["forward", "backward"]).default("forward"),
  /** Interpolation curve shaping the per-group fade. */
  easing: EasingSchema.default("easeOut"),
});

/** Parsed params for the `line-wipe` effect. */
export type LineWipeParams = z.infer<typeof LineWipeParamsSchema>;
