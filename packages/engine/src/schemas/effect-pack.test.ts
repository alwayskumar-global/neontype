import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EffectPackSchema } from "./effect-pack.js";
import { arbValidEffectPack } from "../testing/arbitraries.js";

/**
 * A valid pack with two effect instances and three param descriptors (one each
 * of number / enum / color), every binding referencing an in-range instance.
 * `description` is intentionally empty to assert the empty-string case is
 * accepted.
 */
const validPack = {
  schemaVersion: 1,
  id: "neon-glow",
  displayName: "Neon Glow",
  description: "",
  effectInstances: [
    { effectId: "typewriter", granularity: "character", params: {} },
    { effectId: "fade-slide", granularity: "word", params: { direction: "up" } },
  ],
  paramDescriptors: [
    {
      key: "delay",
      type: "number",
      binding: { effectInstanceIndex: 0, paramKey: "delayPerCharacter" },
      min: 0,
      max: 10,
      default: 0.5,
    },
    {
      key: "dir",
      type: "enum",
      binding: { effectInstanceIndex: 1, paramKey: "direction" },
      values: ["up", "down", "left", "right"],
      default: "up",
    },
    {
      key: "tint",
      type: "color",
      binding: { effectInstanceIndex: 1, paramKey: "color" },
      default: "#1a2b3c",
    },
  ],
};

describe("EffectPackSchema", () => {
  it("accepts a valid pack with number, enum, and color descriptors", () => {
    const result = EffectPackSchema.safeParse(validPack);
    expect(result.success).toBe(true);
  });

  it("accepts a pack with an empty description", () => {
    const result = EffectPackSchema.safeParse({ ...validPack, description: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a pack with an out-of-bounds effectInstanceIndex", () => {
    const result = EffectPackSchema.safeParse({
      ...validPack,
      paramDescriptors: [
        {
          key: "delay",
          type: "number",
          // Only two instances (indexes 0, 1) exist; 5 is out of bounds.
          binding: { effectInstanceIndex: 5, paramKey: "delayPerCharacter" },
          min: 0,
          max: 10,
          default: 0.5,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-kebab-case id", () => {
    const result = EffectPackSchema.safeParse({ ...validPack, id: "Neon_Glow" });
    expect(result.success).toBe(false);
  });

  // Feature: engine-core, Property 2: EffectPack JSON round-trip
  it("safeParse of a JSON round-trip deeply equals the original for any valid pack", () => {
    fc.assert(
      fc.property(arbValidEffectPack, (ep) => {
        const result = EffectPackSchema.safeParse(JSON.parse(JSON.stringify(ep)));
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(ep);
        }
      }),
    );
  });
});
