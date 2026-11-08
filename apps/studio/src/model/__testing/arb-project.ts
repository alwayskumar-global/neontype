/**
 * Shared fast-check arbitrary for a ProjectSchema-valid Project (test-only).
 * Duration is chosen first so layers fit within it.
 */
import fc from "fast-check";
import { ProjectSchema, type Project } from "@studio/engine";

export const arbProject: fc.Arbitrary<Project> = fc
  .record({
    width: fc.integer({ min: 16, max: 7680 }),
    height: fc.integer({ min: 16, max: 4320 }),
    fps: fc.integer({ min: 1, max: 120 }),
    durationSeconds: fc.double({ min: 1, max: 600, noNaN: true }),
  })
  .chain((canvas) =>
    fc
      .array(
        fc.record({
          start: fc.double({ min: 0, max: canvas.durationSeconds, noNaN: true }),
          len: fc.double({ min: 0.1, max: canvas.durationSeconds, noNaN: true }),
          text: fc.string({ minLength: 1, maxLength: 40 }),
          fontSize: fc.integer({ min: 1, max: 1000 }),
          fill: fc.constantFrom("#ffffff", "#ff00aa", "#123456"),
          align: fc.constantFrom("left", "center", "right"),
          fontFamily: fc.constantFrom("Noto Sans", "Noto Sans Tamil"),
          fontWeight: fc.constantFrom("400", "700"),
          seed: fc.integer(),
        }),
        { minLength: 1, maxLength: 6 },
      )
      .map((rows) => {
        const layers = rows.map((r, i) => {
          const startSeconds = Math.min(r.start, canvas.durationSeconds - 0.01);
          const end = Math.min(canvas.durationSeconds, startSeconds + r.len);
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
            endSeconds: end > startSeconds ? end : Math.min(canvas.durationSeconds, startSeconds + 0.1),
            anchor: { x: 0, y: 0 },
          };
        });
        const project: Project = { schemaVersion: 1, canvas, background: "#101018", seed: 7, layers };
        return project;
      }),
  )
  .filter((p) => ProjectSchema.safeParse(p).success);
