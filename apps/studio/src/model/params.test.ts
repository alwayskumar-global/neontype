import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { builtinRegistry, presetCatalog, type Project } from "@studio/engine";
import { Store } from "../shell/store.js";
import { applyAction, paramEditAllowed } from "./transitions.js";
import { newProject } from "./project.js";
/**
 * Effect param edits are validated against the effect's own param schema (Requirement 4.5), through the
 * engine's public registry. A rejected edit returns the SAME project reference, like a project-schema
 * rejection, so the store changes nothing and the undo history is untouched.
 */
function withAllEffects(): { project: Project; layerId: string } {
  let p = newProject();
  const layerId = p.layers[0]!.id;
  p = { ...p, layers: p.layers.map((l) => ({ ...l, effectInstances: [] })) };
  for (const e of presetCatalog) p = applyAction(p, { type: "add-effect", layerId, effectId: e.id });
  return { project: p, layerId };
}
const indexOf = (p: Project, effectId: string): number => p.layers[0]!.effectInstances.findIndex((e) => e.effectId === effectId);
describe("set-effect-param validates against the effect schema", () => {
  const { project, layerId } = withAllEffects();
  it("the fixture has every catalog effect", () => {
    expect(project.layers[0]!.effectInstances.map((e) => e.effectId)).toEqual(presetCatalog.map((e) => e.id));
  });
  it("rejects a negative delay for Typewriter: the same reference comes back", () => {
    const index = indexOf(project, "typewriter");
    const next = applyAction(project, { type: "set-effect-param", layerId, index, key: "delayPerCharacter", value: -1 });
    expect(next).toBe(project);
  });
  it("rejects a value of the wrong type, a bad enum value, and a non-finite number", () => {
    const index = indexOf(project, "typewriter");
    for (const [key, value] of [["delayPerCharacter", "fast"], ["delayPerCharacter", null], ["direction", "sideways"], ["direction", 3], ["startDelay", Number.NaN], ["startDelay", Number.POSITIVE_INFINITY]] as const) {
      expect(applyAction(project, { type: "set-effect-param", layerId, index, key, value }), `${key}=${String(value)}`).toBe(project);
    }
  });
  it("rejects a key the instance does not have", () => {
    const index = indexOf(project, "wave");
    expect(applyAction(project, { type: "set-effect-param", layerId, index, key: "bogus", value: 1 })).toBe(project);
  });
  it("accepts a valid edit and returns a new project that holds it", () => {
    const index = indexOf(project, "typewriter");
    const next = applyAction(project, { type: "set-effect-param", layerId, index, key: "delayPerCharacter", value: 0.2 });
    expect(next).not.toBe(project);
    expect(next.layers[0]!.effectInstances[index]!.params["delayPerCharacter"]).toBe(0.2);
    const dir = applyAction(next, { type: "set-effect-param", layerId, index, key: "direction", value: "backward" });
    expect(dir.layers[0]!.effectInstances[index]!.params["direction"]).toBe("backward");
  });
  it("setting the value it already has is a no-op (same reference)", () => {
    const index = indexOf(project, "typewriter");
    expect(applyAction(project, { type: "set-effect-param", layerId, index, key: "direction", value: "forward" })).toBe(project);
  });
  it("an effect the registry does not know is not checked, and an issue on another key does not block an edit", () => {
    expect(paramEditAllowed("no-such-effect", { a: 1 }, "a", "anything")).toBe(true);
    const broken = { startDelay: 0, delayPerCharacter: -1, direction: "forward" };
    expect(paramEditAllowed("typewriter", broken, "startDelay", 1)).toBe(true);
    expect(paramEditAllowed("typewriter", broken, "delayPerCharacter", -2)).toBe(false);
    expect(paramEditAllowed("typewriter", broken, "delayPerCharacter", 0.1)).toBe(true);
  });
});
describe("the store sees a rejected param edit as no change", () => {
  it("dispatchGuarded returns false, the project is the same object, and no undo step is added", () => {
    const { project, layerId } = withAllEffects();
    const store = new Store(project);
    const index = indexOf(project, "typewriter");
    expect(store.dispatchGuarded({ type: "set-effect-param", layerId, index, key: "delayPerCharacter", value: -1 })).toBe(false);
    expect(store.getState().project).toBe(project);
    expect(store.historyLength()).toBe(0);
    expect(store.canUndo()).toBe(false);
    expect(store.dispatchGuarded({ type: "set-effect-param", layerId, index, key: "delayPerCharacter", value: 0.3 })).toBe(true);
    expect(store.historyLength()).toBe(1);
  });
});
// Feature: studio, Property 15: Invalid effect params are never committed
describe("Property 15: invalid effect params are never committed", () => {
  const { project: base, layerId } = withAllEffects();
  const targets = base.layers[0]!.effectInstances.flatMap((e, index) => Object.keys(e.params).map((key) => ({ index, effectId: e.effectId, key })));
  const arbValue = fc.oneof(
    fc.double({ noNaN: false }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.string({ maxLength: 8 }),
    fc.boolean(),
    fc.constant(null),
    fc.constantFrom("forward", "backward", "x", "y", "linear", "easeIn", "easeOut", "easeInOut", "nope"),
  );
  it("any sequence of random param edits leaves every instance valid for its effect, and a rejected edit returns the same reference", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...targets), arbValue), { maxLength: 25 }), (edits) => {
        let p = base;
        for (const [t, value] of edits) {
          const def = builtinRegistry.get(t.effectId)!;
          const current = p.layers[0]!.effectInstances[t.index]!.params;
          const wouldBeValid = def.paramSchema.safeParse({ ...current, [t.key]: value }).success;
          const next = applyAction(p, { type: "set-effect-param", layerId, index: t.index, key: t.key, value });
          if (!wouldBeValid) expect(next, `${t.effectId}.${t.key}=${String(value)}`).toBe(p);
          p = next;
        }
        for (const inst of p.layers[0]!.effectInstances) {
          expect(builtinRegistry.get(inst.effectId)!.paramSchema.safeParse(inst.params).success, inst.effectId).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
