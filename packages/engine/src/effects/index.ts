/**
 * Built-in effect registration and the default pre-populated registry.
 *
 * `registerBuiltinEffects` installs every effect bundled with the engine into a
 * caller-supplied registry. Adding a new built-in effect requires updating only
 * this function (R8.3).
 *
 * `builtinRegistry` is the default registry: a fresh `createRegistry()` with the
 * built-in effects registered into it at module load. The registry module
 * (`registry.ts`) itself performs NO load-time registration — this module is the
 * single place that assembles the default registry (R7.7).
 */

import { createRegistry, type EffectRegistry } from "../registry.js";
import { register as registerFadeSlide } from "./fade-slide/index.js";
import { register as registerTypewriter } from "./typewriter/index.js";

/** Registers all effects bundled with the engine into `registry`. */
export function registerBuiltinEffects(registry: EffectRegistry): void {
  registerTypewriter(registry);
  registerFadeSlide(registry);
}

/** The default registry, pre-populated with the built-in effects. */
export const builtinRegistry: EffectRegistry = createRegistry();
registerBuiltinEffects(builtinRegistry);
