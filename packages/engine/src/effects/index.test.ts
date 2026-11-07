import { describe, expect, it } from "vitest";

import { DuplicateEffectError } from "../errors.js";
import { createRegistry } from "../registry.js";
import { builtinRegistry, registerBuiltinEffects } from "./index.js";

describe("builtinRegistry", () => {
  it("resolves the typewriter effect to a defined EffectDefinition", () => {
    const definition = builtinRegistry.get("typewriter");
    expect(definition).toBeDefined();
    expect(definition?.id).toBe("typewriter");
  });

  it("resolves the fade-slide effect to a defined EffectDefinition", () => {
    const definition = builtinRegistry.get("fade-slide");
    expect(definition).toBeDefined();
    expect(definition?.id).toBe("fade-slide");
  });
});

describe("registerBuiltinEffects", () => {
  it("populates a fresh registry with every built-in effect", () => {
    const registry = createRegistry();
    registerBuiltinEffects(registry);

    expect(registry.get("typewriter")?.id).toBe("typewriter");
    expect(registry.get("fade-slide")?.id).toBe("fade-slide");
  });

  it("throws DuplicateEffectError when applied twice to the same registry", () => {
    const registry = createRegistry();
    registerBuiltinEffects(registry);

    expect(() => registerBuiltinEffects(registry)).toThrow(DuplicateEffectError);
  });
});
