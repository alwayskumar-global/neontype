/**
 * The `spotlight` effect.
 *
 *   s = clamp((t - startDelay) / durationSeconds, 0, 1)
 *   groupCount <= 1  → opacity 1 (single group always in focus)
 *   else:
 *     f = s * (groupCount - 1)
 *     d = abs(groupIndex - f)
 *     opacity = d <= radius ? 1
 *             : clamp(1 - (d - radius) * (1 - dimOpacity), dimOpacity, 1)
 *   settleAtEnd && s >= 1 → opacity 1 for every group (terminal identity)
 *   settleAtEnd === false → keep dimming after the sweep (exempt from identity)
 *
 * Approximates a moving spotlight gradient with distance-based opacity. Pure;
 * invalid params throw. No import-time side effects.
 */

import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp } from "../shared.js";
import { SpotlightParamsSchema } from "./schema.js";

const EFFECT_ID = "spotlight";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = SpotlightParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid spotlight params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;

  if (args.groupCount <= 1) {
    return { opacity: 1 };
  }

  const s = clamp((args.t - params.startDelay) / params.durationSeconds, 0, 1);

  if (params.settleAtEnd && s >= 1) {
    return { opacity: 1 };
  }

  const f = s * (args.groupCount - 1);
  const d = Math.abs(args.groupIndex - f);
  const opacity =
    d <= params.radius
      ? 1
      : clamp(1 - (d - params.radius) * (1 - params.dimOpacity), params.dimOpacity, 1);

  return { opacity: clamp(opacity, 0, 1) };
}

/** Registers the `spotlight` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Spotlight",
    paramSchema: SpotlightParamsSchema,
    applyEffect,
  });
}
