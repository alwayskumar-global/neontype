/**
 * The `neon-flicker` effect (looping).
 *
 *   phase = (((t - groupIndex * phasePerGroup) % period) + period) % period  // [0, period)
 *   k     = min(cellsPerPeriod - 1, floor((phase / period) * cellsPerPeriod)) // [0, cells-1]
 *
 * Draw exactly `k + 1` PRNG values in order; the LAST value `r` drives:
 *
 *   opacity = clamp(minOpacity + (1 - minOpacity) * r, 0, 1)                  // in [minOpacity, 1]
 *
 * `phase`, `k`, and the draws depend only on `phase`, so the output repeats
 * exactly every `periodSeconds` (looping — exempt from terminal identity).
 * Quantizing into cells is required because the per-segment PRNG is stateless
 * per frame: equal cells ⇒ identical draws ⇒ determinism; different cells ⇒ the
 * brightness flickers. Pure; invalid params throw. No import-time side effects.
 */

import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp } from "../shared.js";
import { NeonFlickerParamsSchema } from "./schema.js";

const EFFECT_ID = "neon-flicker";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = NeonFlickerParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid neon-flicker params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;
  const period = params.periodSeconds;

  const raw = args.t - args.groupIndex * params.phasePerGroup;
  const phase = ((raw % period) + period) % period;
  const k = Math.min(
    params.cellsPerPeriod - 1,
    Math.floor((phase / period) * params.cellsPerPeriod),
  );

  let r = 0;
  for (let i = 0; i <= k; i++) {
    r = args.prng.next();
  }

  const opacity = clamp(params.minOpacity + (1 - params.minOpacity) * r, 0, 1);
  return { opacity };
}

/** Registers the `neon-flicker` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Neon Flicker",
    paramSchema: NeonFlickerParamsSchema,
    applyEffect,
  });
}
