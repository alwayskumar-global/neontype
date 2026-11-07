/**
 * The `letter-spread` effect.
 *
 *   p = clamp((t - startDelay) / durationSeconds, 0, 1)   // no per-group delay
 *   e = evaluate(easing, 0, 1, p)
 *   m = (groupIndex - (groupCount - 1) / 2) * spreadDistance * (1 - e)
 *   positionOffset = axis === "x" ? [m, 0] : [0, m]       // each axis clamped
 *
 * `groupCount <= 1` → `[0, 0]` (the lone group's index equals the center). At
 * `p = 0` the offset is fully spread; at `p = 1` → `[0, 0]` (identity).
 *
 * Approximates letter spacing — which `SegmentOverrides` cannot express
 * directly — with a per-group additive offset. Pure; invalid params throw. No
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
import { LetterSpreadParamsSchema } from "./schema.js";

const EFFECT_ID = "letter-spread";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = LetterSpreadParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid letter-spread params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  if (args.groupCount <= 1) {
    return { positionOffset: [0, 0] };
  }

  const p = clamp((args.t - params.startDelay) / params.durationSeconds, 0, 1);
  const e = evaluate(params.easing, 0, 1, p);
  const m = (args.groupIndex - (args.groupCount - 1) / 2) * params.spreadDistance * (1 - e);
  const clamped = clamp(m, -32000, 32000);

  return {
    positionOffset: params.axis === "x" ? [clamped, 0] : [0, clamped],
  };
}

/** Registers the `letter-spread` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Letter Spread",
    paramSchema: LetterSpreadParamsSchema,
    applyEffect,
  });
}
