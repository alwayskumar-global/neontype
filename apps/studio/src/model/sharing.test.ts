/**
 * Structural sharing and no-op detection in the reducer (Requirement 16.7, 16.15).
 * - an action whose result equals the input returns the SAME reference, so the
 *   store adds no undo step;
 * - an accepted action keeps every untouched subtree by reference;
 * - parsing never silently drops a schema default.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ProjectSchema, type Project } from "@studio/engine";
import { deepEqualJson } from "./json-equal.js";
import { applyAction, commit } from "./transitions.js";
import type { Action } from "./actions.js";
import { demoProject } from "./demo.js";
import { newProject } from "./project.js";
import { arbProject } from "./__testing/arb-project.js";
import { Store } from "../shell/store.js";

describe("deepEqualJson", () => {
  it("compares plain JSON structurally, ignoring key order", () => {
    expect(deepEqualJson({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(deepEqualJson([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqualJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqualJson({ a: undefined }, {})).toBe(false);
    expect(deepEqualJson([], {})).toBe(false);
    expect(deepEqualJson(null, {})).toBe(false);
    expect(deepEqualJson("a", "a")).toBe(true);
    expect(deepEqualJson(1, "1")).toBe(false);
  });
});

describe("precondition: ProjectSchema.parse(p) deep-equals p", () => {
  it("holds for the demo project and a new project", () => {
    expect(ProjectSchema.parse(demoProject())).toEqual(demoProject());
    expect(ProjectSchema.parse(newProject())).toEqual(newProject());
  });
});

describe("structural sharing", () => {
  it("set-anchor on one layer keeps every other layer (and canvas) by reference", () => {
    const p = demoProject();
    const out = applyAction(p, { type: "set-anchor", id: p.layers[1].id, x: 5, y: 6 });
    expect(out).not.toBe(p);
    out.layers.forEach((l, i) => {
      if (i === 1) expect(l).not.toBe(p.layers[i]);
      else expect(l).toBe(p.layers[i]);
    });
    expect(out.canvas).toBe(p.canvas);
  });

  it("the edited layer shares its own untouched subtrees (effect instances, anchor of others)", () => {
    const p = demoProject();
    const out = applyAction(p, { type: "set-fill", id: p.layers[0].id, fill: "#112233" });
    expect(out.layers[0].effectInstances).toBe(p.layers[0].effectInstances);
    expect(out.layers[0].tracks).toBe(p.layers[0].tracks);
  });

  it("the undo history holds shared references, not copies", () => {
    const s = new Store(demoProject());
    const before = s.getState().project;
    s.dispatchGuarded({ type: "set-anchor", id: before.layers[0].id, x: 1, y: 2 });
    const after = s.getState().project;
    expect(after.layers[1]).toBe(before.layers[1]);
    expect(after.layers[2]).toBe(before.layers[2]);
    s.undo();
    expect(s.getState().project).toBe(before);
  });
});

/** Every action, set to the value the demo project ALREADY has. */
function noOpActions(p: Project): Action[] {
  const l = p.layers[0];
  const fx = l.effectInstances[0];
  return [
    { type: "set-canvas-size", width: p.canvas.width, height: p.canvas.height },
    { type: "set-fps", fps: p.canvas.fps },
    { type: "set-duration", durationSeconds: p.canvas.durationSeconds },
    { type: "set-background", background: p.background },
    { type: "reorder-layer", id: l.id, toIndex: 0 },
    { type: "set-text", id: l.id, text: l.text },
    { type: "set-font-family", id: l.id, fontFamily: l.fontFamily as "Noto Sans" },
    { type: "set-font-size", id: l.id, fontSize: l.fontSize },
    { type: "set-font-weight", id: l.id, fontWeight: l.fontWeight },
    { type: "set-fill", id: l.id, fill: l.fill },
    { type: "set-align", id: l.id, align: l.align },
    { type: "set-anchor", id: l.id, x: l.anchor.x, y: l.anchor.y },
    { type: "set-layer-timing", id: l.id, startSeconds: l.startSeconds, endSeconds: l.endSeconds },
    { type: "set-effect-granularity", layerId: l.id, index: 0, granularity: fx.granularity },
    { type: "set-effect-param", layerId: l.id, index: 0, key: "startDelay", value: (fx.params as Record<string, unknown>).startDelay },
    // Rejected / absent targets also leave the project unchanged.
    { type: "set-text", id: "no-such-layer", text: "x" },
    { type: "delete-layer", id: "no-such-layer" },
    { type: "set-font-size", id: l.id, fontSize: -1 },
  ];
}

describe("every set-* action with its current value is a no-op", () => {
  it("returns the same Project reference", () => {
    const p = demoProject();
    for (const a of noOpActions(p)) expect(applyAction(p, a), a.type).toBe(p);
  });

  it("adds no undo step through the store", () => {
    const s = new Store(demoProject());
    for (const a of noOpActions(s.getState().project)) {
      expect(s.dispatchGuarded(a), a.type).toBe(false);
      expect(s.historyLength(), a.type).toBe(0);
    }
  });

  it("set-transparent is a no-op when the background already matches", () => {
    const solid = applyAction(demoProject(), { type: "set-background", background: "#000000" });
    expect(applyAction(solid, { type: "set-transparent", transparent: false })).toBe(solid);
    const clear = applyAction(demoProject(), { type: "set-transparent", transparent: true });
    expect(applyAction(clear, { type: "set-transparent", transparent: true })).toBe(clear);
  });

  it("a real change is still accepted (and is a new reference)", () => {
    const p = demoProject();
    expect(applyAction(p, { type: "set-text", id: p.layers[0].id, text: "changed" })).not.toBe(p);
  });
});

/** Random actions, half of them set to the current value (no-ops). */
const arbAction = (p: Project): fc.Arbitrary<Action> => {
  const l = p.layers[0];
  return fc.oneof(
    fc.record({ keep: fc.boolean(), v: fc.string({ minLength: 1, maxLength: 20 }) }).map(({ keep, v }): Action => ({ type: "set-text", id: l.id, text: keep ? l.text : v })),
    fc.record({ keep: fc.boolean(), v: fc.constantFrom("#ffffff", "#ff00aa", "#123456") }).map(({ keep, v }): Action => ({ type: "set-fill", id: l.id, fill: keep ? l.fill : v })),
    fc.record({ keep: fc.boolean(), v: fc.integer({ min: 0, max: 1000 }), w: fc.integer({ min: 0, max: 1000 }) }).map(({ keep, v, w }): Action => ({ type: "set-anchor", id: l.id, x: keep ? l.anchor.x : v, y: keep ? l.anchor.y : w })),
    fc.record({ keep: fc.boolean(), v: fc.integer({ min: -5, max: 300 }) }).map(({ keep, v }): Action => ({ type: "set-font-size", id: l.id, fontSize: keep ? l.fontSize : v })),
    fc.constantFrom("left", "center", "right").map((align): Action => ({ type: "set-align", id: l.id, align })),
    fc.record({ keep: fc.boolean(), v: fc.integer({ min: 0, max: 200 }) }).map(({ keep, v }): Action => ({ type: "set-fps", fps: keep ? p.canvas.fps : v })),
    fc.constant<Action>({ type: "add-layer" }),
  );
};

// Feature: studio, Property 10: No-op detection is exact
describe("Property 10: applyAction(p, a) === p iff the result deep-equals p", () => {
  it("holds for random accepted, unchanged and rejected actions", () => {
    fc.assert(
      fc.property(arbProject.chain((p) => fc.tuple(fc.constant(p), arbAction(p))), ([p, a]) => {
        const out = applyAction(p, a);
        expect(out === p).toBe(deepEqualJson(out, p));
        // Whatever comes back is schema-valid.
        expect(ProjectSchema.safeParse(out).success).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("defaults are never dropped", () => {
  it("every layer of every action result has numeric letterSpacing and lineHeight", () => {
    fc.assert(
      fc.property(arbProject.chain((p) => fc.tuple(fc.constant(p), arbAction(p))), ([p, a]) => {
        for (const l of applyAction(p, a).layers) {
          expect(typeof l.letterSpacing).toBe("number");
          expect(typeof l.lineHeight).toBe("number");
        }
      }),
      { numRuns: 300 },
    );
    const p = demoProject();
    for (const a of noOpActions(p)) {
      for (const l of applyAction(p, a).layers) {
        expect(typeof l.letterSpacing).toBe("number");
        expect(typeof l.lineHeight).toBe("number");
      }
    }
  });

  it("fallback: a candidate layer missing lineHeight is committed with lineHeight 1.2 (the parsed copy)", () => {
    const p = demoProject();
    const { lineHeight: _drop, ...withoutLineHeight } = { ...p.layers[0], text: "changed" };
    void _drop;
    const candidate = { ...p, layers: [withoutLineHeight as unknown as Project["layers"][number], ...p.layers.slice(1)] };
    const out = commit(p, candidate);
    expect(out).not.toBe(candidate);
    expect(out).not.toBe(p);
    expect(out.layers[0].lineHeight).toBe(1.2);
    expect(out.layers[0].text).toBe("changed");
  });

  it("fallback: a candidate that only differs by a missing default is a no-op (same reference)", () => {
    const p = demoProject();
    const { lineHeight: _drop, ...without } = p.layers[0];
    void _drop;
    const candidate = { ...p, layers: [without as unknown as Project["layers"][number], ...p.layers.slice(1)] };
    expect(commit(p, candidate)).toBe(p);
  });

  it("a rejected candidate returns the original project", () => {
    const p = demoProject();
    const bad = { ...p, layers: [{ ...p.layers[0], fontSize: -1 }, ...p.layers.slice(1)] };
    expect(commit(p, bad)).toBe(p);
  });
});
