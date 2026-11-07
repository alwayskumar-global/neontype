/**
 * The `line-wipe` effect.
 *
 *   threshold = direction === "forward"
 *     ? startDelay + groupIndex * delayPerGroup
 *     : startDelay + (groupCount - 1 - groupIndex) * delayPerGroup
 *
 *   fadeSeconds == 0:  opacity = t >= threshold ? 1 : 0
 *   fadeSeconds  > 0:  q = clamp((t - threshold) / fadeSeconds, 0, 1)
 *                      opacity = evaluate(easing, 0, 1, q)
 *
 * At/after `threshold + fadeSeconds`, `opacity` is exactly `1` (identity for the
 * animated property). Approximates a continuous clip wipe with a per-group
 * opacity threshold sweep plus a short fade. Pure; invalid params throw. No
 * import-time side effects.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp } from "../shared.js";
import { LineWipeParamsSchema } from "./schema.js";

const EFFECT_ID = "line-wipe";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = LineWipeParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid line-wipe params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  const threshold =
    params.direction === "forward"
      ? params.startDelay + args.groupIndex * params.delayPerGroup
      : params.startDelay + (args.groupCount - 1 - args.groupIndex) * params.delayPerGroup;

  let opacity: number;
  if (params.fadeSeconds === 0) {
    opacity = args.t >= threshold ? 1 : 0;
  } else {
    const q = clamp((args.t - threshold) / params.fadeSeconds, 0, 1);
    opacity = evaluate(params.easing, 0, 1, q);
  }

  return { opacity: clamp(opacity, 0, 1) };
}

/** Registers the `line-wipe` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Line Wipe",
    paramSchema: LineWipeParamsSchema,
    applyEffect,
  });
}
