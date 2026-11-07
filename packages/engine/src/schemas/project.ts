/**
 * Zod schemas for the top-level Project document and its TextLayers (R1.1,
 * R1.2), plus the shared color/background helpers.
 *
 * These schemas are the source of truth for the project data model. Field-level
 * numeric ranges (canvas dimensions, fontSize, letterSpacing, lineHeight,
 * anchor, timing bounds) live directly on their field schemas. The two kinds of
 * cross-field invariant are split by what data they need:
 *
 * - `TextLayerSchema.superRefine()` enforces the checks a layer can verify on
 *   its own (R1.2, R1.13): `endSeconds > startSeconds`, and every keyframe `t`
 *   within the layer-local range `[0, endSeconds - startSeconds]`. (`startSeconds
 *   >= 0` is already enforced by the field's `.nonnegative()`.)
 *
 * - `ProjectSchema.superRefine()` enforces the cross-document check that needs
 *   the canvas (R1.12): every `layer.endSeconds <= canvas.durationSeconds`. It
 *   also re-checks the layer-local keyframe `t` upper bound for every layer so
 *   the project-level validation is self-contained per the task.
 *
 * anchor decision: R1.2 says the default anchor is the canvas center, but a Zod
 * default cannot reference sibling canvas dimensions. The "default = canvas
 * center" is therefore a construction-time convenience, not a schema default.
 * `anchor` is modelled here as a REQUIRED object with `x`/`y` each constrained
 * to [-32000, 32000], matching the design's `anchor: { x: number; y: number }`.
 */

import { z } from "zod";

import { KeyframeTrackSchema } from "./keyframe.js";
import { EffectInstanceSchema } from "./effect-instance.js";

/** Six-digit hex color string, e.g. `#1a2b3c` (R1.2 `fill`, R1.1 `background`). */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A project background: a hex color, or the literal `"transparent"` (R1.1). */
export const BackgroundSchema = z.union([HexColorSchema, z.literal("transparent")]);

/** Text horizontal alignment (R1.2 `align`). */
const AlignSchema = z.enum(["left", "center", "right"]);

/** Canvas settings: dimensions, frame rate, and duration (R1.1 `canvas`). */
const CanvasSchema = z.object({
  width: z.number().min(1).max(7680),
  height: z.number().min(1).max(4320),
  fps: z.number().min(1).max(120),
  durationSeconds: z.number().min(0.1).max(600),
});

/** Layer anchor in canvas coordinates; each axis in [-32000, 32000] px (R1.2). */
const AnchorSchema = z.object({
  x: z.number().min(-32000).max(32000),
  y: z.number().min(-32000).max(32000),
});

/**
 * A single animated text layer (R1.2).
 *
 * The `superRefine` enforces the layer-local timing and keyframe invariants
 * (R1.2, R1.13). The `endSeconds <= canvas.durationSeconds` check (R1.12) is
 * NOT here because a layer has no access to the canvas; it lives on
 * `ProjectSchema` below.
 */
export const TextLayerSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1).max(2000),
    tracks: z.array(KeyframeTrackSchema),
    effectInstances: z.array(EffectInstanceSchema).max(16),
    fontFamily: z.string().min(1),
    fontSize: z.number().positive().max(1000),
    fontWeight: z.string(),
    fill: HexColorSchema,
    align: AlignSchema,
    letterSpacing: z.number().min(-500).max(500).default(0),
    lineHeight: z.number().min(0.1).max(10).default(1.2),
    maxWidth: z.number().positive().nullable(),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number(),
    anchor: AnchorSchema,
  })
  .superRefine((layer, ctx) => {
    if (layer.endSeconds <= layer.startSeconds) {
      ctx.addIssue({
        code: "custom",
        message: "endSeconds must be greater than startSeconds.",
        path: ["endSeconds"],
      });
    }

    const localDuration = layer.endSeconds - layer.startSeconds;
    for (let ti = 0; ti < layer.tracks.length; ti++) {
      const track = layer.tracks[ti];
      for (let ki = 0; ki < track.keyframes.length; ki++) {
        if (track.keyframes[ki].t > localDuration) {
          ctx.addIssue({
            code: "custom",
            message: "Keyframe t must not exceed endSeconds - startSeconds.",
            path: ["tracks", ti, "keyframes", ki, "t"],
          });
        }
      }
    }
  });

/** The text-layer type, derived from `TextLayerSchema`. */
export type TextLayer = z.infer<typeof TextLayerSchema>;

/**
 * The top-level Project document (R1.1).
 *
 * The `superRefine` enforces the cross-document invariants that require the
 * canvas: for every layer, `endSeconds <= canvas.durationSeconds` (R1.12), and
 * (re-checked here for completeness) each keyframe `t` within the layer-local
 * range (R1.13).
 */
export const ProjectSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    canvas: CanvasSchema,
    background: BackgroundSchema,
    seed: z.number().int(),
    layers: z.array(TextLayerSchema).max(64),
  })
  .superRefine((project, ctx) => {
    for (let li = 0; li < project.layers.length; li++) {
      const layer = project.layers[li];

      if (layer.endSeconds > project.canvas.durationSeconds) {
        ctx.addIssue({
          code: "custom",
          message: "Layer endSeconds must not exceed canvas durationSeconds.",
          path: ["layers", li, "endSeconds"],
        });
      }

      const localDuration = layer.endSeconds - layer.startSeconds;
      for (let ti = 0; ti < layer.tracks.length; ti++) {
        const track = layer.tracks[ti];
        for (let ki = 0; ki < track.keyframes.length; ki++) {
          if (track.keyframes[ki].t > localDuration) {
            ctx.addIssue({
              code: "custom",
              message: "Keyframe t must not exceed endSeconds - startSeconds.",
              path: ["layers", li, "tracks", ti, "keyframes", ki, "t"],
            });
          }
        }
      }
    }
  });

/** The project type, derived from `ProjectSchema`. */
export type Project = z.infer<typeof ProjectSchema>;
