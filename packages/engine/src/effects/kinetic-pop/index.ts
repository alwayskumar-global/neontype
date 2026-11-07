/**
 * The `kinetic-pop` effect.
 *
 * Piecewise scale curve with an exact single peak. Let `peakAt = 0.6` and
 * `target = max(startScale, 1 + overshoot)`:
 *
 *   e = evaluate(easing, 0, 1, p)
 *   if p == 1:            scale = 1                      // literal identity
 *   else if e <= peakAt:  u = e / peakAt
 *                         scale = startScale + (target - startScale) * evaluate("easeOut", 0, 1, u)
 *   else:                 v = (e - peakAt) / (1 - peakAt)
 *                         scale = target + (1 - target) * smoothstep(v)   // v*v*(3 - 2v)
 *   opacity = e
 *
 * Proof: at e=0 → startScale; at e=peakAt both branches give `target` (the max,
 * attained at eased 0.6 ∈ (0.25, 0.75)); at p=1 → exactly 1. The first branch is
 * non-decreasing when startScale ≤ target, the second non-increasing since
 * (1 - target) ≤ 0. `scale` is clamped to [0, 100] (the hard guarantee for
 * startScale > 1). Pure; invalid params throw. No import-time side effects.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp, staggeredProgress } from "../shared.js";
import { KineticPopParamsSchema } from "./schema.js";

const EFFECT_ID = "kinetic-pop";
const PEAK_AT = 0.6;

/** Hermite smoothstep on [0,1]: 0 at v=0, 1 at v=1, flat tangents. */
function smoothstep(v: number): number {
  return v * v * (3 - 2 * v);
}

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = KineticPopParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid kinetic-pop params", EFFECT_ID, parsed.error);
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
  const target = Math.max(params.startScale, 1 + params.overshoot);

  let scale: number;
  if (p === 1) {
    scale = 1;
  } else if (e <= PEAK_AT) {
    const u = e / PEAK_AT;
    scale = params.startScale + (target - params.startScale) * evaluate("easeOut", 0, 1, u);
  } else {
    const v = (e - PEAK_AT) / (1 - PEAK_AT);
    scale = target + (1 - target) * smoothstep(v);
  }

  return {
    opacity: clamp(e, 0, 1),
    scale: clamp(scale, 0, 100),
  };
}

/** Registers the `kinetic-pop` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Kinetic Pop",
    paramSchema: KineticPopParamsSchema,
    applyEffect,
  });
}
