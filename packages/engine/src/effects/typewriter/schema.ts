/**
 * Zod schema for the `typewriter` effect's params.
 *
 * The typewriter effect reveals segments one group at a time, in order
 * (`"forward"`) or reverse order (`"backward"`). `startDelay` offsets when the
 * reveal begins; `delayPerCharacter` is the per-group stagger.
 *
 * Both numeric fields use `.finite()` in addition to `.nonnegative()` to reject
 * `NaN` and `±Infinity`, consistent with the keyframe-schema hardening. This
 * strengthens validation without changing the task's non-negativity contract:
 * every value the task calls "non-negative" is still accepted, and the only
 * additional rejections are non-finite numbers that could never produce a
 * meaningful reveal threshold.
 */

import { z } from "zod";

/** Params accepted by the `typewriter` effect. */
export const TypewriterParamsSchema = z.object({
  /** Seconds before the first group is revealed. Non-negative, finite. */
  startDelay: z.number().finite().nonnegative().default(0),
  /** Per-group reveal stagger in seconds. Non-negative, finite. */
  delayPerCharacter: z.number().finite().nonnegative(),
  /** Reveal order: left-to-right (`forward`) or right-to-left (`backward`). */
  direction: z.enum(["forward", "backward"]),
});

/** Parsed params for the `typewriter` effect. */
export type TypewriterParams = z.infer<typeof TypewriterParamsSchema>;
