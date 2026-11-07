// Feature: effect-presets, Property 8: Catalog–registry drift guard
//
// This test is the SOLE enforcement of catalog/registry consistency (the
// catalog itself never throws at module load, Requirement 14/15). It builds a
// registry via createRegistry() + registerBuiltinEffects and asserts the
// catalog and registry cannot drift apart.

import { describe, expect, it } from "vitest";

import { createRegistry } from "../registry.js";
import { registerBuiltinEffects } from "./index.js";
import { presetCatalog } from "./catalog.js";

const LOOPING = new Set(["wave", "neon-flicker"]);
const GRANULARITIES = new Set(["character", "word", "line"]);

/** The built-in ids, discovered by probing the registry for each catalog id. */
function builtRegistry() {
  const r = createRegistry();
  registerBuiltinEffects(r);
  return r;
}

/**
 * Captures the EXACT set of ids `registerBuiltinEffects` registers, by wrapping
 * a real registry and recording every `register` call. This lets the drift
 * guard check the registry → catalog direction (no registered id missing from
 * the catalog) without relying on registry key enumeration (the `EffectRegistry`
 * interface exposes only `register`/`get`).
 */
function registeredIds(): string[] {
  const base = createRegistry();
  const ids: string[] = [];
  const capturing = {
    register(def: Parameters<typeof base.register>[0]) {
      ids.push(def.id);
      base.register(def);
    },
    get: base.get.bind(base),
  };
  registerBuiltinEffects(capturing);
  return ids;
}

describe("presetCatalog — drift guard (Property 8)", () => {
  it("every catalog id resolves to a registered EffectDefinition (R15.1)", () => {
    const r = builtRegistry();
    const unresolved = presetCatalog.filter((e) => r.get(e.id) === undefined).map((e) => e.id);
    expect(unresolved, `unresolved catalog ids: ${unresolved.join(", ")}`).toHaveLength(0);
  });

  it("catalog ids equal the registered built-in ids exactly, no duplicates (R15.2)", () => {
    const catalogIds = presetCatalog.map((e) => e.id);
    const regIds = registeredIds();
    // No duplicates on either side.
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(new Set(regIds).size).toBe(regIds.length);
    // Same count and same set in BOTH directions: no registered effect missing
    // from the catalog, no catalog id that is not registered.
    expect(catalogIds).toHaveLength(regIds.length);
    expect(new Set(catalogIds)).toEqual(new Set(regIds));
    expect(regIds).toHaveLength(12);
  });

  it("each displayName matches the registered EffectDefinition.displayName (R15.3)", () => {
    const r = builtRegistry();
    for (const entry of presetCatalog) {
      expect(r.get(entry.id)?.displayName).toBe(entry.displayName);
    }
  });

  it("each defaultParams passes the registered effect's paramSchema.safeParse (R15.4)", () => {
    const r = builtRegistry();
    for (const entry of presetCatalog) {
      const def = r.get(entry.id)!;
      const result = def.paramSchema.safeParse(entry.defaultParams);
      expect(result.success, `defaultParams invalid for ${entry.id}: ${result.success ? "" : JSON.stringify(result.error.issues)}`).toBe(true);
    }
  });

  it("each supportedGranularities is a non-empty distinct subset of the three (R15.5)", () => {
    for (const entry of presetCatalog) {
      const g = entry.supportedGranularities;
      expect(g.length).toBeGreaterThanOrEqual(1);
      expect(g.length).toBeLessThanOrEqual(3);
      expect(new Set(g).size).toBe(g.length); // distinct
      for (const v of g) expect(GRANULARITIES.has(v)).toBe(true);
    }
  });

  it("loop is true only for wave and neon-flicker (R14.4)", () => {
    for (const entry of presetCatalog) {
      expect(entry.loop).toBe(LOOPING.has(entry.id));
    }
  });
});
