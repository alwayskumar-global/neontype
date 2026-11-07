/**
 * Built-in effect registration and the default pre-populated registry.
 *
 * `registerBuiltinEffects` installs every effect bundled with the engine into a
 * caller-supplied registry. Adding a new built-in effect requires updating only
 * this function (R8.3, R13.1).
 *
 * `builtinRegistry` is the default registry: a fresh `createRegistry()` with the
 * built-in effects registered into it at module load. The registry module
 * (`registry.ts`) itself performs NO load-time registration — this module is the
 * single place that assembles the default registry (R7.7).
 */

import { createRegistry, type EffectRegistry } from "../registry.js";
import { register as registerTypewriter } from "./typewriter/index.js";
import { register as registerFadeSlide } from "./fade-slide/index.js";
import { register as registerBlurIn } from "./blur-in/index.js";
import { register as registerGlitchReveal } from "./glitch-reveal/index.js";
import { register as registerKineticPop } from "./kinetic-pop/index.js";
import { register as registerLetterSpread } from "./letter-spread/index.js";
import { register as registerLineWipe } from "./line-wipe/index.js";
import { register as registerNeonFlicker } from "./neon-flicker/index.js";
import { register as registerRotateDrop } from "./rotate-drop/index.js";
import { register as registerScaleBounce } from "./scale-bounce/index.js";
import { register as registerSpotlight } from "./spotlight/index.js";
import { register as registerWave } from "./wave/index.js";

/** Registers all effects bundled with the engine into `registry`. */
export function registerBuiltinEffects(registry: EffectRegistry): void {
  // Reference effects.
  registerTypewriter(registry);
  registerFadeSlide(registry);
  // Preset effects (effect-presets feature).
  registerBlurIn(registry);
  registerGlitchReveal(registry);
  registerKineticPop(registry);
  registerLetterSpread(registry);
  registerLineWipe(registry);
  registerNeonFlicker(registry);
  registerRotateDrop(registry);
  registerScaleBounce(registry);
  registerSpotlight(registry);
  registerWave(registry);
}

/** The default registry, pre-populated with the built-in effects. */
export const builtinRegistry: EffectRegistry = createRegistry();
registerBuiltinEffects(builtinRegistry);
