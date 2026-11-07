/**
 * The `rotate-drop` effect.
 *
 *   p = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
 *   e = evaluate(easing, 0, 1, p)
 *   opacity        = e
 *   positionOffset = [0, dropDistance * (1 - e)]     // y axis clamped
 *   rotation       = startRotation * (1 - e)         // clamped
 *
 * At `p = 0`: `opacity 0`, `[0, dropDistance]`, `rotation startRotation`. At
 * `p = 1`: `opacity 1`, `[0, 0]`, `rotation 0` (identity). Pure; invalid params
 * throw. No import-time side effects.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp, staggeredProgress } from "../shared.js";
import { RotateDropParamsSchema } from "./schema.js";

const EFFECT_ID = "rotate-drop";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = RotateDropParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid rotate-drop params", EFFECT_ID, parsed.error);
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
    positionOffset: [0, clamp(params.dropDistance * (1 - e), -32000, 32000)],
    rotation: clamp(params.startRotation * (1 - e), -36000, 36000),
  };
}

/** Registers the `rotate-drop` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Rotate Drop",
    paramSchema: RotateDropParamsSchema,
    applyEffect,
  });
}
