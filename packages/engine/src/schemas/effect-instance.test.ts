import { describe, expect, it } from "vitest";
import { EffectInstanceSchema } from "./effect-instance.js";

describe("EffectInstanceSchema", () => {
  it("accepts a valid instance with empty params", () => {
    const result = EffectInstanceSchema.safeParse({
      effectId: "fade-slide",
      granularity: "character",
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid instance carrying some params", () => {
    const result = EffectInstanceSchema.safeParse({
      effectId: "typewriter",
      granularity: "word",
      params: { startDelay: 0.5, direction: "forward" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an instance with an empty effectId", () => {
    const result = EffectInstanceSchema.safeParse({
      effectId: "",
      granularity: "character",
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-kebab-case effectId", () => {
    const result = EffectInstanceSchema.safeParse({
      effectId: "Fade_Slide",
      granularity: "character",
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid granularity", () => {
    const result = EffectInstanceSchema.safeParse({
      effectId: "fade-slide",
      granularity: "sentence",
      params: {},
    });
    expect(result.success).toBe(false);
  });
});
