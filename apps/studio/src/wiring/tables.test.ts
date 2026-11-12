/**
 * Drift tests for the studio-side tables (gaps D-5 and D-6, Requirement 19.10): the category table and the
 * param-range table must stay in step with the engine's `presetCatalog` and the effects' param schemas.
 */
import { describe, it, expect } from "vitest";
import { builtinRegistry, presetCatalog } from "@studio/engine";
import { CATEGORIES, CATEGORY_BY_ID, RANGES_BY_ID } from "./tables.js";
describe("category table", () => {
  it("has exactly one entry per catalog effect, with a known category", () => {
    expect(Object.keys(CATEGORY_BY_ID).sort()).toEqual(presetCatalog.map((p) => p.id).sort());
    for (const c of Object.values(CATEGORY_BY_ID)) expect(CATEGORIES).toContain(c);
  });
  it("marks an effect Looping exactly when the catalog says it loops", () => {
    for (const p of presetCatalog) expect(CATEGORY_BY_ID[p.id] === "Looping", p.id).toBe(p.loop);
  });
});
describe("param-range table", () => {
  it("has an entry for every effect and no entry for an unknown one", () => {
    expect(Object.keys(RANGES_BY_ID).sort()).toEqual(presetCatalog.map((p) => p.id).sort());
  });
  it("covers exactly the numeric params of each effect's defaults", () => {
    for (const p of presetCatalog) {
      const numeric = Object.entries(p.defaultParams).filter(([, v]) => typeof v === "number").map(([k]) => k).sort();
      expect(Object.keys(RANGES_BY_ID[p.id] ?? {}).sort(), p.id).toEqual(numeric);
    }
  });
  it("each range is sane and contains the effect's default value", () => {
    for (const p of presetCatalog) {
      for (const [key, r] of Object.entries(RANGES_BY_ID[p.id] ?? {})) {
        const def = p.defaultParams[key] as number;
        expect(r.step, `${p.id}.${key} step`).toBeGreaterThan(0);
        expect(r.max - r.min, `${p.id}.${key} span`).toBeGreaterThanOrEqual(r.step);
        expect(def, `${p.id}.${key} default`).toBeGreaterThanOrEqual(r.min);
        expect(def, `${p.id}.${key} default`).toBeLessThanOrEqual(r.max);
      }
    }
  });
  it("both ends of every range, and the default, pass the effect's param schema", () => {
    for (const p of presetCatalog) {
      const def = builtinRegistry.get(p.id);
      expect(def, `${p.id} is registered`).toBeDefined();
      expect(def!.paramSchema.safeParse(p.defaultParams).success, `${p.id} defaults`).toBe(true);
      for (const [key, r] of Object.entries(RANGES_BY_ID[p.id] ?? {})) {
        for (const v of [r.min, r.max]) {
          const res = def!.paramSchema.safeParse({ ...p.defaultParams, [key]: v });
          expect(res.success, `${p.id}.${key}=${v}`).toBe(true);
        }
      }
    }
  });
  it("the drift check detects an out-of-schema range (guard against a vacuous test)", () => {
    const def = builtinRegistry.get("typewriter")!;
    expect(def.paramSchema.safeParse({ ...presetCatalog[0]!.defaultParams, delayPerCharacter: -1 }).success).toBe(false);
  });
});
