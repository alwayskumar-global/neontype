/**
 * The `typewriter` reference effect.
 *
 * Reveals one group (character/word/line, per the effect instance's
 * granularity) at a time. A group is visible once layer-local time reaches its
 * reveal threshold:
 *
 *   forward:  startDelay + groupIndex * delayPerCharacter
 *   backward: startDelay + (groupCount - 1 - groupIndex) * delayPerCharacter
 *
 * `applyEffect` is pure: it validates `params` with `TypewriterParamsSchema`
 * and derives opacity solely from its arguments — no clocks, randomness, or
 * DOM access. Invalid params throw `InvalidEffectParamsError`.
 *
 * This module has NO import-time side effects: `register` must be called
 * explicitly by a caller (e.g. `registerBuiltinEffects`, Task 7.7).
 */

import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { TypewriterParamsSchema } from "./schema.js";

/**
 * Computes the opacity override for a single segment: fully opaque once the
 * group's reveal threshold is reached, otherwise fully transparent.
 */
function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = TypewriterParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError(
      "invalid typewriter params",
      "typewriter",
      parsed.error,
    );
  }

  const params = parsed.data;
  const i = args.groupIndex;
  const N = args.groupCount;
  const tLocal = args.t;

  const threshold =
    params.direction === "forward"
      ? params.startDelay + i * params.delayPerCharacter
      : params.startDelay + (N - 1 - i) * params.delayPerCharacter;

  return { opacity: tLocal >= threshold ? 1 : 0 };
}

/** Registers the `typewriter` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: "typewriter",
    displayName: "Typewriter",
    paramSchema: TypewriterParamsSchema,
    applyEffect,
  });
}
