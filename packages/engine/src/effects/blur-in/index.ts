/**
 * The `blur-in` effect.
 *
 * Reveals each group (character/word/line, per granularity) from a blurred,
 * transparent start into sharp focus:
 *
 *   p    = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
 *   e    = evaluate(easing, 0, 1, p)   // exact 0 at p=0, exact 1 at p=1
 *   opacity = e
 *   blur    = startBlur * (1 - e)
 *
 * At `p = 0`: `opacity 0`, `blur = startBlur`. At `p = 1`: `opacity 1`,
 * `blur 0` (identity). `applyEffect` is pure and derives everything from its
 * arguments; invalid params throw `InvalidEffectParamsError`. No import-time
 * side effects — `register` must be called explicitly.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp, staggeredProgress } from "../shared.js";
import { BlurInParamsSchema } from "./schema.js";

const EFFECT_ID = "blur-in";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = BlurInParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid blur-in params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  const p = staggeredProgress(
    args.t,
    params.startDelay,
    args.groupIndex,
    params.delayPerGroup,
    params.durationSeconds,
  );
  const e = evaluate(params.easing, 0, 1, p);

  return {
    opacity: clamp(e, 0, 1),
    blur: clamp(params.startBlur * (1 - e), 0, 1000),
  };
}

/** Registers the `blur-in` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Blur In",
    paramSchema: BlurInParamsSchema,
    applyEffect,
  });
}
