/**
 * Zod schema for the `wave` effect's params.
 *
 * `wave` is a LOOPING effect: each group oscillates along one axis with a
 * traveling phase, repeating every `periodSeconds`. Every numeric field is
 * `.finite()` with hard min/max bounds. Defaults match the preset catalog.
 */

import { z } from "zod";

/** Params accepted by the `wave` effect. */
export const WaveParamsSchema = z.object({
  /** Loop period in seconds. */
  periodSeconds: z.number().finite().min(0.05).max(60).default(1.5),
  /** Oscillation amplitude in px. */
  amplitude: z.number().finite().min(0).max(32000).default(16),
  /** Axis the oscillation runs along. */
  axis: z.enum(["x", "y"]).default("y"),
  /** Per-group phase offset in radians. */
  phasePerGroup: z.number().finite().min(-100).max(100).default(0.6),
});

/** Parsed params for the `wave` effect. */
export type WaveParams = z.infer<typeof WaveParamsSchema>;
