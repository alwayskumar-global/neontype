/**
 * Unit tests for `ProjectSchema` / `TextLayerSchema`.
 *
 * The first blocks (Task 3.3) cover a realistic valid project, the two
 * cross-field timing invariants (`endSeconds > startSeconds` and layer-local
 * keyframe `t` bound), the project-level `endSeconds <= canvas.durationSeconds`
 * check, and the `cubicBezier` control-point bound exercised through a keyframe
 * track.
 *
 * The later blocks (Task 3.6) make the coverage comprehensive: missing required
 * fields, out-of-range scalars, hard limits (array/string lengths), invalid
 * `schemaVersion` / `background`, and exact boundary ACCEPTANCE proving the
 * inclusive limits. The `EffectPackSchema` out-of-bounds `effectInstanceIndex`
 * criterion from Task 3.6 is already covered in `effect-pack.test.ts` (Task
 * 3.4) and is intentionally not duplicated here. The serialization criteria are
 * fully covered by `serialize.test.ts` (Task 3.5), which needed no change.
 *
 * Full project PBTs (round-trip, hard-limit rejection, invalid-input safety)
 * arrive in Tasks 3.8-3.11 and are intentionally out of scope here.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbOutOfBoundsProject } from "../testing/arbitraries.js";
import { ProjectSchema, TextLayerSchema } from "./project.js";

/**
 * A realistic valid layer: a position track with two keyframes (one using a
 * valid in-range cubicBezier easing), one effect instance, anchor, and a full
 * set of style/timing fields.
 */
function makeValidLayer() {
  return {
    id: "layer-1",
    text: "Hello",
    tracks: [
      {
        property: "position" as const,
        keyframes: [
          {
            t: 0,
            value: [0, 0] as [number, number],
            easing: { type: "cubicBezier" as const, x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
          },
          { t: 1, value: [100, 50] as [number, number], easing: "linear" as const },
        ],
      },
    ],
    effectInstances: [
      { effectId: "typewriter", granularity: "character" as const, params: { delayPerCharacter: 0.05 } },
    ],
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: "700",
    fill: "#ff00aa",
    align: "center" as const,
    letterSpacing: 0,
    lineHeight: 1.2,
    maxWidth: 1280,
    startSeconds: 0,
    endSeconds: 2,
    anchor: { x: 960, y: 540 },
  };
}

/** A realistic valid project wrapping one valid layer in a 1920x1080 canvas. */
function makeValidProject() {
  return {
    schemaVersion: 1,
    canvas: { width: 1920, height: 1080, fps: 30, durationSeconds: 10 },
    background: "#000000",
    seed: 42,
    layers: [makeValidLayer()],
  };
}

describe("ProjectSchema", () => {
  it("accepts a fully valid project", () => {
    const result = ProjectSchema.safeParse(makeValidProject());
    expect(result.success).toBe(true);
  });

  it("rejects a layer with startSeconds >= endSeconds", () => {
    const project = makeValidProject();
    project.layers[0].startSeconds = 2;
    project.layers[0].endSeconds = 2;

    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it("rejects a keyframe with t greater than endSeconds - startSeconds", () => {
    const project = makeValidProject();
    // Layer duration is 2s; push a keyframe past the layer-local range.
    project.layers[0].tracks[0].keyframes[1].t = 5;

    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it("rejects a cubicBezier easing with a control point outside [0, 1]", () => {
    const project = makeValidProject();
    project.layers[0].tracks[0].keyframes[0].easing = {
      type: "cubicBezier",
      x1: 1.5,
      y1: 0.1,
      x2: 0.25,
      y2: 1,
    };

    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it("rejects a layer whose endSeconds exceeds canvas.durationSeconds", () => {
    const project = makeValidProject();
    project.canvas.durationSeconds = 1;
    project.layers[0].endSeconds = 2;

    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });
});

describe("TextLayerSchema", () => {
  it("accepts a valid layer on its own", () => {
    expect(TextLayerSchema.safeParse(makeValidLayer()).success).toBe(true);
  });

  it("rejects endSeconds <= startSeconds at the layer level", () => {
    const layer = makeValidLayer();
    layer.startSeconds = 3;
    layer.endSeconds = 2;

    expect(TextLayerSchema.safeParse(layer).success).toBe(false);
  });

  it("rejects a keyframe t beyond the layer-local duration", () => {
    const layer = makeValidLayer();
    layer.tracks[0].keyframes[1].t = 10;

    expect(TextLayerSchema.safeParse(layer).success).toBe(false);
  });
});

/**
 * Comprehensive coverage for Task 3.6: missing-required-field fixtures,
 * out-of-range scalar fixtures, hard-limit (array/length) fixtures, invalid
 * schemaVersion / background values, and — in the other direction — exact
 * boundary ACCEPTANCE so the inclusive limits are proven, not just the
 * rejections. These augment the Task 3.3 cross-field tests above; nothing here
 * duplicates an existing assertion.
 *
 * Determinism: every fixture is built by deep-cloning the single valid base and
 * applying one targeted mutation. No `Math.random` / `Date.now` is used; large
 * fixtures use `"x".repeat(...)` / `Array.from(...)` which are deterministic.
 */

/** A structured deep clone of the valid project, safe to mutate per-case. */
function cloneValidProject() {
  return structuredClone(makeValidProject());
}

type ProjectMutation = (p: ReturnType<typeof cloneValidProject>) => void;

describe("ProjectSchema — missing required fields", () => {
  const missingFieldCases: ReadonlyArray<readonly [string, ProjectMutation]> = [
    [
      "project missing canvas",
      (p) => {
        delete (p as Record<string, unknown>).canvas;
      },
    ],
    [
      "layer missing anchor",
      (p) => {
        delete (p.layers[0] as Record<string, unknown>).anchor;
      },
    ],
    [
      "layer missing fontFamily",
      (p) => {
        delete (p.layers[0] as Record<string, unknown>).fontFamily;
      },
    ],
  ];

  it.each(missingFieldCases)("rejects: %s", (_label, mutate) => {
    const project = cloneValidProject();
    mutate(project);
    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });
});

describe("ProjectSchema — out-of-range scalar values", () => {
  const outOfRangeCases: ReadonlyArray<readonly [string, ProjectMutation]> = [
    ["canvas.width 0 (min 1)", (p) => void (p.canvas.width = 0)],
    ["canvas.width 8000 (max 7680)", (p) => void (p.canvas.width = 8000)],
    ["canvas.fps 0 (min 1)", (p) => void (p.canvas.fps = 0)],
    ["canvas.fps 200 (max 120)", (p) => void (p.canvas.fps = 200)],
    ["canvas.durationSeconds 0 (min 0.1)", (p) => void (p.canvas.durationSeconds = 0)],
    ["canvas.durationSeconds 700 (max 600)", (p) => void (p.canvas.durationSeconds = 700)],
    ["fontSize 0 (positive)", (p) => void (p.layers[0].fontSize = 0)],
    ["fontSize 1500 (max 1000)", (p) => void (p.layers[0].fontSize = 1500)],
    ["letterSpacing -600 (min -500)", (p) => void (p.layers[0].letterSpacing = -600)],
    ["letterSpacing 600 (max 500)", (p) => void (p.layers[0].letterSpacing = 600)],
    ["lineHeight 0 (min 0.1)", (p) => void (p.layers[0].lineHeight = 0)],
    ["lineHeight 20 (max 10)", (p) => void (p.layers[0].lineHeight = 20)],
    ["anchor.x 40000 (max 32000)", (p) => void (p.layers[0].anchor.x = 40000)],
  ];

  it.each(outOfRangeCases)("rejects: %s", (_label, mutate) => {
    const project = cloneValidProject();
    mutate(project);
    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });
});

describe("ProjectSchema — hard limits (array and string lengths)", () => {
  it("rejects a layers array longer than 64", () => {
    const project = cloneValidProject();
    const base = project.layers[0];
    project.layers = Array.from({ length: 65 }, (_unused, i) => ({
      ...structuredClone(base),
      id: `layer-${i}`,
    }));

    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });

  it("rejects text longer than 2000 characters", () => {
    const project = cloneValidProject();
    project.layers[0].text = "x".repeat(2001);

    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });

  it("rejects an effectInstances array longer than 16", () => {
    const project = cloneValidProject();
    const base = project.layers[0].effectInstances[0];
    project.layers[0].effectInstances = Array.from({ length: 17 }, () =>
      structuredClone(base),
    );

    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });
});

describe("ProjectSchema — schemaVersion and background validation", () => {
  const badSchemaVersions: ReadonlyArray<readonly [string, number]> = [
    ["0 (not positive)", 0],
    ["-1 (not positive)", -1],
    ["1.5 (not an integer)", 1.5],
  ];

  it.each(badSchemaVersions)("rejects schemaVersion %s", (_label, version) => {
    const project = cloneValidProject();
    project.schemaVersion = version;
    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });

  it("rejects a background that is neither hex nor \"transparent\"", () => {
    const project = cloneValidProject();
    project.background = "not-a-color";
    expect(ProjectSchema.safeParse(project)).toMatchObject({ success: false });
  });

  it("accepts background \"transparent\"", () => {
    const project = cloneValidProject();
    project.background = "transparent";
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });
});

describe("ProjectSchema — exact boundary ACCEPTANCE (inclusive limits)", () => {
  const boundaryAcceptCases: ReadonlyArray<readonly [string, ProjectMutation]> = [
    ["canvas.width exactly 1", (p) => void (p.canvas.width = 1)],
    ["canvas.width exactly 7680", (p) => void (p.canvas.width = 7680)],
    ["canvas.fps exactly 1", (p) => void (p.canvas.fps = 1)],
    ["canvas.fps exactly 120", (p) => void (p.canvas.fps = 120)],
    [
      "canvas.durationSeconds exactly 0.1 (layer timing shrunk to fit)",
      (p) => {
        p.canvas.durationSeconds = 0.1;
        p.layers[0].startSeconds = 0;
        p.layers[0].endSeconds = 0.1;
        // Keyframes must stay within the 0.1s layer-local range.
        p.layers[0].tracks[0].keyframes[0].t = 0;
        p.layers[0].tracks[0].keyframes[1].t = 0.1;
      },
    ],
    ["canvas.durationSeconds exactly 600", (p) => void (p.canvas.durationSeconds = 600)],
    ["fontSize exactly 1000", (p) => void (p.layers[0].fontSize = 1000)],
    ["letterSpacing exactly -500", (p) => void (p.layers[0].letterSpacing = -500)],
    ["letterSpacing exactly 500", (p) => void (p.layers[0].letterSpacing = 500)],
    ["lineHeight exactly 0.1", (p) => void (p.layers[0].lineHeight = 0.1)],
    ["lineHeight exactly 10", (p) => void (p.layers[0].lineHeight = 10)],
    ["anchor.x exactly -32000", (p) => void (p.layers[0].anchor.x = -32000)],
    ["anchor.x exactly 32000", (p) => void (p.layers[0].anchor.x = 32000)],
    [
      "layer text exactly 2000 characters",
      (p) => void (p.layers[0].text = "x".repeat(2000)),
    ],
    [
      "layers array of exactly 64",
      (p) => {
        const base = p.layers[0];
        p.layers = Array.from({ length: 64 }, (_unused, i) => ({
          ...structuredClone(base),
          id: `layer-${i}`,
        }));
      },
    ],
  ];

  it.each(boundaryAcceptCases)("accepts: %s", (_label, mutate) => {
    const project = cloneValidProject();
    mutate(project);
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });
});

describe("ProjectSchema — hard-limits rejection (property-based)", () => {
  // Feature: engine-core, Property 12: Hard-limits rejection
  it("rejects any project-like object that exceeds a hard limit, without throwing", () => {
    fc.assert(
      fc.property(arbOutOfBoundsProject, (p) => {
        const result = ProjectSchema.safeParse(p);
        expect(result.success).toBe(false);
      }),
    );
  });
});

/**
 * Property 13 (R11.6): parsing arbitrary, untrusted JSON values must be SAFE —
 * `safeParse` reports failure rather than throwing. We generate with
 * `fc.anything()` and `.filter()` out anything that is already a valid Project,
 * which encodes the task's own precondition ("any JSON value that is NOT a
 * valid Project"). The filter is not a workaround for a generator defect: it
 * makes the "not a valid Project" precondition precise and keeps the property
 * stable against the astronomically unlikely case where `fc.anything()` happens
 * to emit a structurally valid project. `fc.anything()` also yields
 * `undefined`, functions, symbols, bigints, and deeply nested structures; Zod's
 * `safeParse` must absorb all of them without throwing.
 */
describe("ProjectSchema — invalid-input rejection (property-based)", () => {
  // Feature: engine-core, Property 13: Invalid-input rejection is safe
  it("returns { success: false } and never throws for any non-Project value", () => {
    fc.assert(
      fc.property(
        fc.anything().filter((v) => !ProjectSchema.safeParse(v).success),
        (v) => {
          expect(() => ProjectSchema.safeParse(v)).not.toThrow();
          expect(ProjectSchema.safeParse(v).success).toBe(false);
        },
      ),
    );
  });
});
