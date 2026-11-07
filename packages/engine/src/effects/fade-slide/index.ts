/**
 * The `fade-slide` reference effect.
 *
 * Fades each group (character/word/line, per the effect instance's
 * granularity) in from transparent to fully opaque while sliding it from a
 * starting offset into its laid-out position. Progress runs over
 * `durationSeconds`, staggered per group by `delayPerSegment`:
 *
 *   p      = clamp((tLocal - groupIndex * delayPerSegment) / durationSeconds, 0, 1)
 *   eased  = evaluate(easing, 0, 1, p)
 *   offset = slideDistance * (1 - eased)   // along slideAxis; the other axis is 0
 *   opacity = eased
 *
 * Boundary guarantees come from `evaluate`, which returns exactly its `b`
 * boundary at `p = 1` and exactly its `a` boundary at `p = 0` for every easing
 * variant. So at `p = 1`, `eased` is exactly `1`: opacity is exactly `1` and
 * the offset magnitude is `slideDistance * (1 - 1) = 0`, giving `[0, 0]`. At
 * `p = 0`, `eased` is exactly `0`: opacity is `0` and the offset is the full
 * `slideDistance`.
 *
 * `applyEffect` is pure: it validates `params` with `FadeSlideParamsSchema`
 * and derives its result solely from its arguments — no clocks, randomness, or
 * DOM access. Invalid params throw `InvalidEffectParamsError`.
 *
 * This module has NO import-time side effects: `register` must be called
 * explicitly by a caller (e.g. `registerBuiltinEffects`, Task 7.7).
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { FadeSlideParamsSchema } from "./schema.js";

/**
 * Computes the opacity and position-offset overrides for a single segment:
 * eased progress drives opacity directly, and the remaining (un-eased) fraction
 * of `slideDistance` is applied as a one-axis offset.
 */
function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = FadeSlideParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError(
      "invalid fade-slide params",
      "fade-slide",
      parsed.error,
    );
  }

  const params = parsed.data;
  const i = args.groupIndex;
  const tLocal = args.t;

  const rawP = (tLocal - i * params.delayPerSegment) / params.durationSeconds;
  const p = Math.min(1, Math.max(0, rawP));
  const eased = evaluate(params.easing, 0, 1, p);

  const offsetMagnitude = params.slideDistance * (1 - eased);
  const positionOffset: [number, number] =
    params.slideAxis === "x" ? [offsetMagnitude, 0] : [0, offsetMagnitude];

  return { opacity: eased, positionOffset };
}

/** Registers the `fade-slide` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: "fade-slide",
    displayName: "Fade Slide",
    paramSchema: FadeSlideParamsSchema,
    applyEffect,
  });
}
