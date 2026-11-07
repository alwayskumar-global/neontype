/**
 * Zod schema for the `neon-flicker` effect's params.
 *
 * `neon-flicker` is a LOOPING effect: each group's opacity flickers on a fixed
 * `periodSeconds` loop, quantized into `cellsPerPeriod` discrete cells. The cell
 * index selects how many PRNG values to draw (the last is the cell's flicker
 * value), so the brightness varies across cells while staying deterministic and
 * repeating every period. Every numeric field is `.finite()` with hard min/max
 * bounds; `cellsPerPeriod` is an integer in `[1, 64]`. Defaults match the
 * preset catalog.
 */

import { z } from "zod";

/** Params accepted by the `neon-flicker` effect. */
export const NeonFlickerParamsSchema = z.object({
  /** Loop period in seconds. */
  periodSeconds: z.number().finite().min(0.05).max(60).default(1.2),
  /** Floor opacity; output is in `[minOpacity, 1]`. */
  minOpacity: z.number().finite().min(0).max(1).default(0.4),
  /** Number of discrete flicker cells per period. */
  cellsPerPeriod: z.number().int().finite().min(1).max(64).default(16),
  /** Per-group phase offset in seconds. */
  phasePerGroup: z.number().finite().min(0).max(60).default(0.07),
});

/** Parsed params for the `neon-flicker` effect. */
export type NeonFlickerParams = z.infer<typeof NeonFlickerParamsSchema>;
