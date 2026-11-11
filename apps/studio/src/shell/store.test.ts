import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Store, HISTORY_CAP } from "./store.js";
import { newProject } from "../model/project.js";
import { applyAction } from "../model/transitions.js";
import { demoProject } from "../model/demo.js";

const id = (s: Store): string => s.getState().project.layers[0].id;
const anchor = (s: Store) => s.getState().project.layers[0].anchor;

describe("transitions: unchanged actions return the same reference", () => {
  it("set-anchor and set-layer-timing", () => {
    const p = newProject();
    const l = p.layers[0];
    expect(applyAction(p, { type: "set-anchor", id: l.id, x: l.anchor.x, y: l.anchor.y })).toBe(p);
    expect(applyAction(p, { type: "set-layer-timing", id: l.id, startSeconds: l.startSeconds, endSeconds: l.endSeconds })).toBe(p);
    expect(applyAction(p, { type: "set-anchor", id: l.id, x: l.anchor.x + 1, y: l.anchor.y })).not.toBe(p);
  });
});

describe("Store history", () => {
  it("one accepted dispatch is one step; a rejected or unchanged one adds none", () => {
    const s = new Store();
    const l = s.getState().project.layers[0];
    expect(s.dispatchGuarded({ type: "set-anchor", id: l.id, x: l.anchor.x, y: l.anchor.y })).toBe(false);
    expect(s.historyLength()).toBe(0);
    expect(s.dispatchGuarded({ type: "set-anchor", id: l.id, x: 7, y: 8 })).toBe(true);
    expect(s.historyLength()).toBe(1);
    expect(s.dispatchGuarded({ type: "set-font-size", id: l.id, fontSize: -5 })).toBe(false);
    expect(s.historyLength()).toBe(1);
  });

  it("a gesture is ONE step regardless of how many live previews", () => {
    const s = new Store();
    const start = s.getState().project;
    const lid = id(s);
    s.beginGesture();
    for (let i = 1; i <= 20; i++) s.preview({ type: "set-anchor", id: lid, x: i, y: i });
    expect(s.historyLength()).toBe(0);
    expect(s.commitGesture()).toBe(true);
    expect(s.historyLength()).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.getState().project).toBe(start);
  });

  it("a no-op gesture adds no step", () => {
    const s = new Store();
    const l = s.getState().project.layers[0];
    s.beginGesture();
    s.preview({ type: "set-anchor", id: l.id, x: l.anchor.x, y: l.anchor.y });
    expect(s.commitGesture()).toBe(false);
    expect(s.historyLength()).toBe(0);
  });

  it("cancelGesture restores the base and adds no step", () => {
    const s = new Store();
    const start = s.getState().project;
    s.beginGesture();
    s.preview({ type: "set-anchor", id: id(s), x: 3, y: 4 });
    s.cancelGesture();
    expect(s.getState().project).toBe(start);
    expect(s.historyLength()).toBe(0);
  });

  it("undo during an open gesture cancels it without an extra step", () => {
    const s = new Store();
    const lid = id(s);
    s.dispatchGuarded({ type: "set-anchor", id: lid, x: 1, y: 1 });
    const afterFirst = s.getState().project;
    s.beginGesture();
    s.preview({ type: "set-anchor", id: lid, x: 9, y: 9 });
    expect(s.undo()).toBe(true);
    expect(s.getState().project).toBe(afterFirst);
    expect(s.historyLength()).toBe(1);
  });

  it("undo on an empty history is a no-op with the same project reference", () => {
    const s = new Store();
    const p = s.getState().project;
    expect(s.canUndo()).toBe(false);
    expect(s.undo()).toBe(false);
    expect(s.getState().project).toBe(p);
  });

  it("preview is ignored without an open gesture", () => {
    const s = new Store();
    const p = s.getState().project;
    expect(s.preview({ type: "set-anchor", id: id(s), x: 1, y: 1 })).toBe(false);
    expect(s.getState().project).toBe(p);
  });

  it("setProject clears history and any open gesture", () => {
    const s = new Store();
    s.dispatchGuarded({ type: "set-anchor", id: id(s), x: 1, y: 1 });
    s.beginGesture();
    s.setProject(demoProject());
    expect(s.historyLength()).toBe(0);
    expect(s.canUndo()).toBe(false);
  });

  it("caps history at 100, dropping the oldest", () => {
    const s = new Store();
    const lid = id(s);
    for (let i = 1; i <= HISTORY_CAP + 25; i++) s.dispatchGuarded({ type: "set-anchor", id: lid, x: i, y: 0 });
    expect(s.historyLength()).toBe(HISTORY_CAP);
  });

  it("undo repairs selection (deleted layer) and clamps the playhead to the restored duration", () => {
    const s = new Store();
    s.dispatchGuarded({ type: "add-layer" });
    const added = s.getState().project.layers[1].id;
    s.setUi({ selectedLayerId: added, playhead: 4.5 });
    s.dispatchGuarded({ type: "set-duration", durationSeconds: 8 });
    s.undo(); // back to the project that still has the layer (set-duration undone)
    s.undo(); // add-layer undone: the selected layer no longer exists
    const st = s.getState();
    expect(st.ui.selectedLayerId).toBe(st.project.layers[0].id);
    expect(st.ui.playhead).toBeLessThanOrEqual(st.project.canvas.durationSeconds);
  });

  it("clamps the playhead when undo restores a shorter duration", () => {
    const s = new Store();
    s.dispatchGuarded({ type: "set-duration", durationSeconds: 20 });
    s.setUi({ playhead: 15 });
    s.undo();
    expect(s.getState().ui.playhead).toBe(s.getState().project.canvas.durationSeconds);
  });
});

// Feature: studio, Property 9: Undo restores
describe("Property 9: undo restores", () => {
  it("undoing every accepted action returns the original project", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: fc.integer({ min: 0, max: 1280 }), y: fc.integer({ min: 0, max: 720 }) }), { maxLength: 30 }),
        (moves) => {
          const s = new Store(demoProject());
          const original = s.getState().project;
          const lid = id(s);
          let accepted = 0;
          for (const m of moves) if (s.dispatchGuarded({ type: "set-anchor", id: lid, x: m.x, y: m.y })) accepted++;
          expect(s.historyLength()).toBe(accepted);
          for (let i = 0; i < accepted; i++) expect(s.undo()).toBe(true);
          expect(s.getState().project).toEqual(original);
          expect(anchor(s)).toEqual(original.layers[0].anchor);
          expect(s.undo()).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
