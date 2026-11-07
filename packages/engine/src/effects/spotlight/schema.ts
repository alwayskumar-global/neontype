/**
 * Zod schema for the `spotlight` effect's params.
 *
 * `spotlight` moves a brightened focus across the groups, dimming those outside
 * it — approximating a moving spotlight (which `SegmentOverrides` cannot express
 * as a gradient) by modulating per-group opacity by distance from a moving
 * focus. Every numeric field is `.finite()` with hard min/max bounds. Defaults
 * match the preset catalog.
 */

import { z } from "zod";

/** Params accepted by the `spotlight` effect. */
export const SpotlightParamsSchema = z.object({
  /** Seconds before the focus sweep begins. */
  startDelay: z.number().finite().min(0).max(60).default(0),
  /** Seconds for the focus to travel across all groups. */
  durationSeconds: z.number().finite().min(0.001).max(60).default(1.5),
  /** Number of groups within full brightness around the focus. */
  radius: z.number().finite().min(0).max(10000).default(1),
  /** Opacity for groups fully outside the focus. */
  dimOpacity: z.number().finite().min(0).max(1).default(0.15),
  /** Whether every group settles to full opacity after the sweep completes. */
  settleAtEnd: z.boolean().default(true),
});

/** Parsed params for the `spotlight` effect. */
export type SpotlightParams = z.infer<typeof SpotlightParamsSchema>;
