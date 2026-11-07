/**
 * The `scale-bounce` effect.
 *
 *   p = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
 *
 * bounces >= 1 — damped cosine:
 *   scale = 1 + (startScale - 1) * (1 - p) * cos(PI * (2 * bounces + 0.5) * p)
 *   At p=0 → startScale; at p=1 → exactly 1 (literal). The envelope
 *   |startScale - 1| * (1 - p) strictly decays, so successive extremum
 *   deviations from 1 strictly decrease; the phase yields exactly `bounces`
 *   intervals in (0,1) where scale exceeds 1.
 *
 * bounces == 0 — monotone branch (no overshoot above 1):
 *   scale = evaluate("easeOut", startScale, 1, p)
 *
 * Opacity (both branches): clamp(p / 0.05, 0, 1) — a quick fade so the group is
 * visible while it bounces; exactly 1 for p >= 0.05 and at p=1. `scale` is
 * clamped to [0, 100] on return. Pure; invalid params throw. No import-time side
 * effects.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp, staggeredProgress } from "../shared.js";
import { ScaleBounceParamsSchema } from "./schema.js";

const EFFECT_ID = "scale-bounce";
const OPACITY_EPSILON = 0.05;

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = ScaleBounceParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid scale-bounce params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  const p = staggeredProgress(
    args.t,
    params.startDelay,
    args.groupIndex,
    params.delayPerGroup,
    params.durationSeconds,
  );

  let scale: number;
  if (p === 1) {
    scale = 1;
  } else if (params.bounces === 0) {
    scale = evaluate("easeOut", params.startScale, 1, p);
  } else {
    scale =
      1 +
      (params.startScale - 1) * (1 - p) * Math.cos(Math.PI * (2 * params.bounces + 0.5) * p);
  }

  return {
    opacity: clamp(p / OPACITY_EPSILON, 0, 1),
    scale: clamp(scale, 0, 100),
  };
}

/** Registers the `scale-bounce` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Scale Bounce",
    paramSchema: ScaleBounceParamsSchema,
    applyEffect,
  });
}
