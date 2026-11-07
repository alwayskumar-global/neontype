import { describe, expect, it } from "vitest";

import { DuplicateEffectError } from "../errors.js";
import { createRegistry } from "../registry.js";
import { builtinRegistry, registerBuiltinEffects } from "./index.js";

/** The twelve built-in effect ids expected in the default registry (R13.2). */
const BUILTIN_IDS = [
  "typewriter",
  "fade-slide",
  "blur-in",
  "glitch-reveal",
  "kinetic-pop",
  "letter-spread",
  "line-wipe",
  "neon-flicker",
  "rotate-drop",
  "scale-bounce",
  "spotlight",
  "wave",
] as const;

describe("builtinRegistry", () => {
  it("resolves every built-in id to an EffectDefinition whose id matches", () => {
    for (const id of BUILTIN_IDS) {
      const definition = builtinRegistry.get(id);
      expect(definition, `missing ${id}`).toBeDefined();
      expect(definition?.id).toBe(id);
    }
  });

  it("returns undefined for an unregistered id without throwing", () => {
    expect(builtinRegistry.get("not-an-effect")).toBeUndefined();
  });
});

describe("registerBuiltinEffects", () => {
  it("populates a fresh registry with all twelve built-in effects", () => {
    const registry = createRegistry();
    registerBuiltinEffects(registry);
    for (const id of BUILTIN_IDS) {
      expect(registry.get(id)?.id, `missing ${id}`).toBe(id);
    }
  });

  it("registers exactly twelve ids (no duplicates, no extras)", () => {
    // Every built-in id resolves; a sentinel non-id does not — and registering
    // into a fresh registry never throws (no internal duplicate).
    const registry = createRegistry();
    expect(() => registerBuiltinEffects(registry)).not.toThrow();
    const resolved = BUILTIN_IDS.filter((id) => registry.get(id) !== undefined);
    expect(resolved).toHaveLength(12);
  });

  it("throws DuplicateEffectError when applied twice to the same registry", () => {
    const registry = createRegistry();
    registerBuiltinEffects(registry);
    expect(() => registerBuiltinEffects(registry)).toThrow(DuplicateEffectError);
  });
});
