import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ProjectSchema, presetCatalog, type Project } from "@studio/engine";

import { applyAction } from "./transitions.js";
import type { Action } from "./actions.js";
import { newProject } from "./project.js";

/* ----------------------------- local arbitraries -------------------------- */

/** A ProjectSchema-valid project arbitrary (duration chosen first so layers fit). */
const arbProject: fc.Arbitrary<Project> = fc
  .record({
    width: fc.integer({ min: 16, max: 7680 }),
    height: fc.integer({ min: 16, max: 4320 }),
    fps: fc.integer({ min: 1, max: 120 }),
    durationSeconds: fc.double({ min: 1, max: 600, noNaN: true }),
  })
  .chain((canvas) =>
    fc
      .array(
        fc
          .record({
            start: fc.double({ min: 0, max: canvas.durationSeconds, noNaN: true }),
            len: fc.double({ min: 0.1, max: canvas.durationSeconds, noNaN: true }),
            text: fc.string({ minLength: 1, maxLength: 40 }),
            fontSize: fc.integer({ min: 1, max: 1000 }),
            fill: fc.constantFrom("#ffffff", "#ff00aa", "#123456"),
            align: fc.constantFrom("left", "center", "right"),
            fontFamily: fc.constantFrom("Noto Sans", "Noto Sans Tamil"),
            fontWeight: fc.constantFrom("400", "700"),
          }),
        { minLength: 1, maxLength: 6 },
      )
      .map((rows) => {
        const layers = rows.map((r, i) => {
          const startSeconds = Math.min(r.start, canvas.durationSeconds - 0.01);
          const endSeconds = Math.min(canvas.durationSeconds, startSeconds + r.len);
          return {
            id: `layer-${i + 1}`,
            text: r.text,
            tracks: [],
            effectInstances: [],
            fontFamily: r.fontFamily,
            fontSize: r.fontSize,
            fontWeight: r.fontWeight,
            fill: r.fill,
            align: r.align,
            letterSpacing: 0,
            lineHeight: 1.2,
            maxWidth: null,
            startSeconds,
            endSeconds: endSeconds > startSeconds ? endSeconds : Math.min(canvas.durationSeconds, startSeconds + 0.1),
            anchor: { x: 0, y: 0 },
          };
        });
        const project: Project = { schemaVersion: 1, canvas, background: "#101018", seed: 7, layers };
        return project;
      }),
  )
  // Keep only arbitrary values the schema accepts (floating-point edge trims).
  .filter((p) => ProjectSchema.safeParse(p).success);

/** An action arbitrary parameterised on a project (ids/indices in range). */
function arbAction(project: Project): fc.Arbitrary<Action> {
  const ids = project.layers.map((l) => l.id);
  const anId = fc.constantFrom(...ids);
  const effectId = fc.constantFrom(...presetCatalog.map((e) => e.id), "not-a-real-effect");
  return fc.oneof(
    fc.record({ type: fc.constant("set-canvas-size" as const), width: fc.integer({ min: -10, max: 9000 }), height: fc.integer({ min: -10, max: 9000 }) }),
    fc.record({ type: fc.constant("set-fps" as const), fps: fc.integer({ min: -5, max: 240 }) }),
    fc.record({ type: fc.constant("set-duration" as const), durationSeconds: fc.double({ min: -1, max: 700, noNaN: true }) }),
    fc.record({ type: fc.constant("set-background" as const), background: fc.constantFrom("#000000", "transparent", "not-a-color") }),
    fc.record({ type: fc.constant("set-transparent" as const), transparent: fc.boolean() }),
    fc.constant({ type: "add-layer" as const }),
    fc.record({ type: fc.constant("delete-layer" as const), id: anId }),
    fc.record({ type: fc.constant("reorder-layer" as const), id: anId, toIndex: fc.integer({ min: -2, max: 8 }) }),
    fc.record({ type: fc.constant("set-text" as const), id: anId, text: fc.string({ maxLength: 50 }) }),
    fc.record({ type: fc.constant("set-font-size" as const), id: anId, fontSize: fc.integer({ min: -10, max: 2000 }) }),
    fc.record({ type: fc.constant("set-fill" as const), id: anId, fill: fc.constantFrom("#abcdef", "nope") }),
    fc.record({ type: fc.constant("set-align" as const), id: anId, align: fc.constantFrom("left", "center", "right") }),
    fc.record({ type: fc.constant("set-anchor" as const), id: anId, x: fc.integer({ min: -40000, max: 40000 }), y: fc.integer({ min: -40000, max: 40000 }) }),
    fc.record({ type: fc.constant("set-layer-timing" as const), id: anId, startSeconds: fc.double({ min: -1, max: 700, noNaN: true }), endSeconds: fc.double({ min: -1, max: 700, noNaN: true }) }),
    fc.record({ type: fc.constant("add-effect" as const), layerId: anId, effectId }),
    fc.record({ type: fc.constant("remove-effect" as const), layerId: anId, index: fc.integer({ min: -1, max: 5 }) }),
  ) as fc.Arbitrary<Action>;
}

/* --------------------------------- unit ----------------------------------- */

describe("applyAction (unit)", () => {
  it("adds a layer and keeps the project valid", () => {
    const p0 = newProject();
    const p1 = applyAction(p0, { type: "add-layer" });
    expect(p1.layers).toHaveLength(2);
    expect(ProjectSchema.safeParse(p1).success).toBe(true);
  });

  it("rejects an out-of-bounds fps without mutating the project", () => {
    const p0 = newProject();
    const p1 = applyAction(p0, { type: "set-fps", fps: 1000 });
    expect(p1).toBe(p0); // unchanged reference
  });

  it("reorders draw order", () => {
    const p0 = applyAction(newProject(), { type: "add-layer" });
    const p1 = applyAction(p0, { type: "reorder-layer", id: p0.layers[1].id, toIndex: 0 });
    expect(p1.layers[0].id).toBe(p0.layers[1].id);
  });

  it("rejects an unknown effect id", () => {
    const p0 = newProject();
    const p1 = applyAction(p0, { type: "add-effect", layerId: p0.layers[0].id, effectId: "nope" });
    expect(p1.layers[0].effectInstances).toHaveLength(p0.layers[0].effectInstances.length);
  });
});

/* ------------------------------- property --------------------------------- */

// Feature: studio, Property 1: Schema-preserving transitions
describe("Property 1: Schema-preserving transitions", () => {
  it("any action yields a schema-valid project OR the unchanged input", () => {
    fc.assert(
      fc.property(
        arbProject.chain((p) => arbAction(p).map((a) => [p, a] as const)),
        ([project, action]) => {
          const next = applyAction(project, action);
          if (next === project) return true; // rejected, unchanged
          return ProjectSchema.safeParse(next).success;
        },
      ),
      { numRuns: 200 },
    );
  });
});
