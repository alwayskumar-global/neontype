/**
 * Zod schemas for easing curves, keyframes, and keyframe tracks.
 *
 * These schemas are the source of truth for the engine's keyframe data model.
 * The `Easing` type is derived from `EasingSchema` here and imported by
 * `easing.ts`, so the runtime schema and the compile-time type can never drift.
 *
 * Per-property value typing (R1.4) cannot live on `KeyframeSchema` alone,
 * because a lone keyframe does not know which property it animates. The generic
 * `KeyframeSchema.value` therefore accepts the union of all possible shapes
 * (a 2-number tuple, a number, or a hex-color string), and the exact
 * per-property match is enforced in `KeyframeTrackSchema.superRefine()`, which
 * does know the track's `property`.
 *
 * HexColorSchema decision: Task 3.3 (`project.ts`) exports its own
 * `HexColorSchema` per its task instructions, so this module keeps a private
 * `hexColorSchema` for the value union only and does not export one. The regex
 * matches the design's `^#[0-9a-fA-F]{6}$`.
 */

import { z } from "zod";

/** Cubic Bézier easing with all control points constrained to [0, 1]. */
const CubicBezierSchema = z.object({
  type: z.literal("cubicBezier"),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
  x2: z.number().min(0).max(1),
  y2: z.number().min(0).max(1),
});

/** Stepped easing with a positive integer number of discrete steps. */
const StepSchema = z.object({
  type: z.literal("step"),
  steps: z.number().int().positive(),
});

/** A named or parameterised interpolation curve. */
export const EasingSchema = z.union([
  z.literal("linear"),
  z.literal("easeIn"),
  z.literal("easeOut"),
  z.literal("easeInOut"),
  CubicBezierSchema,
  StepSchema,
]);

/**
 * The easing curve type, derived from `EasingSchema`. `easing.ts` imports this
 * type so the schema stays the single source of truth.
 */
export type Easing = z.infer<typeof EasingSchema>;

// Keyframe value magnitude limits.
// Stated in requirements R1.4:
const POSITION_MIN = -32000;
const POSITION_MAX = 32000; // px, per axis
const SCALE_MAX = 100; // scale is strictly positive (> 0), max 100
const OPACITY_MIN = 0;
const OPACITY_MAX = 1;
// NOT stated in R1.4 — added as a hostile-input guard against absurd values:
const ROTATION_MIN = -36000; // degrees (100 full turns) — NOT in R1.4
const ROTATION_MAX = 36000; // degrees — NOT in R1.4
const BLUR_MAX = 1000; // px — NOT in R1.4 (min is 0)

/** Six-digit hex color string, e.g. `#1a2b3c`. */
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A `[x, y]` tuple value, used by `position` tracks. */
const tupleValueSchema = z.tuple([z.number(), z.number()]);

/**
 * Per-property value schemas enforcing shape, numeric magnitude range, and
 * finiteness (R1.4, plus the hostile-input guards above). The matching schema is
 * selected by the track's `property` in `KeyframeTrackSchema.superRefine()`.
 * `z.number().finite()` rejects NaN and Infinity.
 */
const positionValueSchema = z.tuple([
  z.number().finite().min(POSITION_MIN).max(POSITION_MAX),
  z.number().finite().min(POSITION_MIN).max(POSITION_MAX),
]);
const scaleValueSchema = z.number().finite().positive().max(SCALE_MAX);
const rotationValueSchema = z.number().finite().min(ROTATION_MIN).max(ROTATION_MAX);
const opacityValueSchema = z.number().finite().min(OPACITY_MIN).max(OPACITY_MAX);
const blurValueSchema = z.number().finite().min(0).max(BLUR_MAX);
const colorValueSchema = hexColorSchema;

/**
 * Generic keyframe value: a 2-number tuple, a number, or a hex-color string.
 * The per-property narrowing happens in `KeyframeTrackSchema.superRefine()`.
 */
const KeyframeValueSchema = z.union([tupleValueSchema, z.number(), hexColorSchema]);

/** A single keyframe: a time, a value, and the curve leaving this keyframe. */
export const KeyframeSchema = z.object({
  t: z.number().nonnegative(),
  value: KeyframeValueSchema,
  easing: EasingSchema,
});

/** The six animatable properties. */
const KeyframePropertySchema = z.union([
  z.literal("position"),
  z.literal("scale"),
  z.literal("rotation"),
  z.literal("opacity"),
  z.literal("blur"),
  z.literal("color"),
]);

type KeyframeProperty = z.infer<typeof KeyframePropertySchema>;

/**
 * Returns the per-property value schema for `property` (R1.4 plus hostile-input
 * guards). Each schema enforces the correct value SHAPE, numeric MAGNITUDE
 * range, and FINITENESS (NaN / Infinity rejected), so a single `safeParse`
 * replaces the old pure type-match check.
 */
function valueSchemaForProperty(property: KeyframeProperty): z.ZodType {
  switch (property) {
    case "position":
      return positionValueSchema;
    case "scale":
      return scaleValueSchema;
    case "rotation":
      return rotationValueSchema;
    case "opacity":
      return opacityValueSchema;
    case "blur":
      return blurValueSchema;
    case "color":
      return colorValueSchema;
  }
}

/**
 * A keyframe track for one property. `superRefine` enforces the two cross-field
 * invariants the design requires: keyframe `t` values are strictly increasing,
 * and every keyframe value conforms to the track's declared `property` type.
 */
export const KeyframeTrackSchema = z
  .object({
    property: KeyframePropertySchema,
    keyframes: z.array(KeyframeSchema).min(1).max(500),
  })
  .superRefine((track, ctx) => {
    for (let i = 0; i < track.keyframes.length; i++) {
      const kf = track.keyframes[i];

      if (i > 0 && kf.t <= track.keyframes[i - 1].t) {
        ctx.addIssue({
          code: "custom",
          message: "Keyframe t values must be strictly increasing.",
          path: ["keyframes", i, "t"],
        });
      }

      const valueResult = valueSchemaForProperty(track.property).safeParse(kf.value);
      if (!valueResult.success) {
        ctx.addIssue({
          code: "custom",
          message: `Keyframe value does not match property "${track.property}" (shape, range, or finiteness).`,
          path: ["keyframes", i, "value"],
        });
      }
    }
  });
