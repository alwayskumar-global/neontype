/**
 * The `glitch-reveal` effect.
 *
 *   p    = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
 *   e    = evaluate(easing, 0, 1, p)
 *   k    = min(steps - 1, floor(p * steps))      // integer time cell in [0, steps-1]
 *   magnitude = maxOffset * (1 - e)
 *   opacity   = e
 *
 * When `magnitude > 0`, draw exactly `k + 1` PRNG values in order and use the
 * LAST TWO as `rx`, `ry` (reuse the single draw for both axes when `k + 1 == 1`)
 * for `positionOffset = [(rx*2-1)*magnitude, (ry*2-1)*magnitude]`, so each axis
 * stays within `[-maxOffset, maxOffset]`. When `magnitude == 0`, return
 * `[0, 0]` and draw ZERO values. At `p = 1`: `magnitude = 0` ⇒ identity.
 *
 * The step quantization makes time-varying jitter from a per-frame-stateless
 * PRNG: equal `k` ⇒ identical draws ⇒ determinism; differing `k` ⇒ the jitter
 * visibly changes across steps. Pure; invalid params throw
 * `InvalidEffectParamsError`. No import-time side effects.
 */

import { evaluate } from "../../easing.js";
import { InvalidEffectParamsError } from "../../errors.js";
import type {
  ApplyEffectArgs,
  EffectRegistry,
  SegmentOverrides,
} from "../../registry.js";
import { clamp, staggeredProgress } from "../shared.js";
import { GlitchRevealParamsSchema } from "./schema.js";

const EFFECT_ID = "glitch-reveal";

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = GlitchRevealParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid glitch-reveal params", EFFECT_ID, parsed.error);
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
  const magnitude = params.maxOffset * (1 - e);
  const opacity = clamp(e, 0, 1);

  if (magnitude <= 0) {
    return { opacity, positionOffset: [0, 0] };
  }

  const k = Math.min(params.steps - 1, Math.floor(p * params.steps));
  // Draw exactly k + 1 values in order; keep the last two.
  let rx = 0;
  let ry = 0;
  for (let i = 0; i <= k; i++) {
    rx = ry;
    ry = args.prng.next();
  }
  // When only one value was drawn (k + 1 === 1), reuse it for both axes.
  if (k === 0) {
    rx = ry;
  }

  const ox = clamp((rx * 2 - 1) * magnitude, -32000, 32000);
  const oy = clamp((ry * 2 - 1) * magnitude, -32000, 32000);
  return { opacity, positionOffset: [ox, oy] };
}

/** Registers the `glitch-reveal` effect into the given registry. */
export function register(registry: EffectRegistry): void {
  registry.register({
    id: EFFECT_ID,
    displayName: "Glitch Reveal",
    paramSchema: GlitchRevealParamsSchema,
    applyEffect,
  });
}
