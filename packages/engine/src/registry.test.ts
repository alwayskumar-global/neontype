import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DuplicateEffectError } from "./errors.js";
import { createRegistry, type EffectDefinition } from "./registry.js";

/** Builds a minimal valid effect definition for tests. */
function makeEffect(id: string): EffectDefinition {
  return {
    id,
    displayName: "X",
    paramSchema: z.object({}),
    applyEffect: () => ({}),
  };
}

describe("createRegistry", () => {
  it("retrieves a registered effect by id", () => {
    const registry = createRegistry();
    const effect = makeEffect("x-effect");

    registry.register(effect);

    expect(registry.get("x-effect")).toBe(effect);
  });

  it("throws DuplicateEffectError when the same id is registered twice", () => {
    const registry = createRegistry();
    registry.register(makeEffect("x-effect"));

    expect(() => registry.register(makeEffect("x-effect"))).toThrow(
      DuplicateEffectError,
    );
  });

  it("returns undefined for an unknown id", () => {
    const registry = createRegistry();

    expect(registry.get("unknown-id")).toBeUndefined();
  });

  it("creates independent registries that do not share state", () => {
    const registryA = createRegistry();
    const registryB = createRegistry();

    registryA.register(makeEffect("x-effect"));

    expect(registryA.get("x-effect")).toBeDefined();
    expect(registryB.get("x-effect")).toBeUndefined();
  });
});
