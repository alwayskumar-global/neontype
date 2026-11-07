/**
 * The `wave` effect (looping).
 *
 *   theta = 2 * PI * (t / period) + groupIndex * phasePerGroup
 *   m     = amplitude * sin(theta)
 *   positionOffset = axis === "x" ? [m, 0] : [0, m]   // each axis clamped
 *
 * `theta` advances by exactly `2*PI` over one `period`, so the output repeats
 * every `periodSeconds` (looping — exempt from terminal identity). Pure;
 * invalid params throw. No import-time side effects.
 */

import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp } from "../shared.js";
import { WaveParamsSchema } from "./schema.js";

const EFFECT_ID = "wave";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = WaveParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid wave params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  const theta = 2 * Math.PI * (args.t / params.periodSeconds) + args.groupIndex * params.phasePerGroup;
  const m = clamp(params.amplitude * Math.sin(theta), -32000, 32000);

  return {
    positionOffset: params.axis === "x" ? [m, 0] : [0, m],
  };
}

/** Registers the `wave` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Wave",
    paramSchema: WaveParamsSchema,
    applyEffect,
  });
}
