/**
 * Core fast-check arbitraries for the engine's data model (Task 3.7).
 *
 * These generators produce values that satisfy every cross-field Zod constraint
 * enforced by `ProjectSchema`, `KeyframeTrackSchema`, and `EffectPackSchema`, so
 * downstream property-based tests can assume a generated value always passes
 * `safeParse`. The one exception is `arbOutOfBoundsProject`, which deliberately
 * violates a hard limit so that it reliably FAILS `safeParse` (used by the
 * hard-limits rejection property, Task 3.10).
 *
 * This module lives under `src/`, so the engine purity lint applies: all
 * randomness comes from fast-check — no `Math.random`, `Date.now`, or
 * `performance.now`.
 *
 * ## Signatures
 *
 * - `arbHexColor: fc.Arbitrary<string>` — a `#rrggbb` lowercase hex color.
 * - `arbEasing: fc.Arbitrary<Easing>` — any of the six easing variants, with
 *   cubicBezier control points in `[0, 1]` and step `steps >= 1`.
 * - `arbKeyframe(property, maxLocalT): fc.Arbitrary<Keyframe>` — one keyframe
 *   with `t` in `[0, maxLocalT]` and a value whose shape matches `property`.
 * - `arbKeyframeTrack(maxLocalT): fc.Arbitrary<KeyframeTrack>` — a track whose
 *   keyframes (1..5) have strictly-increasing `t` values in `[0, maxLocalT]`.
 * - `arbTextLayer(canvasDuration): fc.Arbitrary<TextLayer>` — a layer with
 *   `0 <= startSeconds < endSeconds <= canvasDuration` and keyframe tracks whose
 *   local `t` values stay within `endSeconds - startSeconds`. `effectInstances`
 *   is always `[]` for this task.
 * - `arbValidProject: fc.Arbitrary<Project>` — a full project (1..8 layers) with
 *   every layer fitting inside the canvas duration. No effect instances.
 * - `arbOutOfBoundsProject: fc.Arbitrary<unknown>` — a project-like object that
 *   violates exactly one hard limit, so it always fails `safeParse`.
 * - `arbValidEffectPack: fc.Arbitrary<EffectPack>` — a pack whose descriptor
 *   bindings always index into the generated `effectInstances`.
 * - `arbT(project): fc.Arbitrary<number>` — a time in `[0, durationSeconds]`.
 */

import fc from "fast-check";

import type { Easing } from "../schemas/keyframe.js";
import type { Project, TextLayer } from "../schemas/project.js";
import type { EffectPack } from "../schemas/effect-pack.js";

/** A single keyframe, as produced by `arbKeyframe` / `arbKeyframeTrack`. */
type Keyframe = { t: number; value: number | [number, number] | string; easing: Easing };

/** One of the six animatable properties. */
type KeyframeProperty = "position" | "scale" | "rotation" | "opacity" | "blur" | "color";

/** A keyframe track, as produced by `arbKeyframeTrack`. */
type KeyframeTrack = { property: KeyframeProperty; keyframes: Keyframe[] };

/** Normalizes -0 to +0 so generated values round-trip through JSON unchanged. */
const normalizeZero = (n: number): number => (n === 0 ? 0 : n);

/** The six animatable properties, as a fast-check source. */
const KEYFRAME_PROPERTIES: readonly KeyframeProperty[] = [
  "position",
  "scale",
  "rotation",
  "opacity",
  "blur",
  "color",
];

/**
 * A `#rrggbb` lowercase hex color. Built from six hex digits so it always
 * matches `/^#[0-9a-fA-F]{6}$/`.
 */
export const arbHexColor: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 15 }), { minLength: 6, maxLength: 6 })
  .map((nibbles) => `#${nibbles.map((n) => n.toString(16)).join("")}`);

/**
 * Any easing variant. cubicBezier control points are constrained to `[0, 1]`
 * (schema requirement) and step `steps` is a positive integer.
 */
export const arbEasing: fc.Arbitrary<Easing> = fc.oneof(
  fc.constant<Easing>("linear"),
  fc.constant<Easing>("easeIn"),
  fc.constant<Easing>("easeOut"),
  fc.constant<Easing>("easeInOut"),
  fc
    .record({
      x1: fc.double({ min: 0, max: 1, noNaN: true }).map(normalizeZero),
      y1: fc.double({ min: 0, max: 1, noNaN: true }).map(normalizeZero),
      x2: fc.double({ min: 0, max: 1, noNaN: true }).map(normalizeZero),
      y2: fc.double({ min: 0, max: 1, noNaN: true }).map(normalizeZero),
    })
    .map((cp): Easing => ({ type: "cubicBezier", ...cp })),
  fc
    .integer({ min: 1, max: 100 })
    .map((steps): Easing => ({ type: "step", steps })),
);

/**
 * A keyframe value whose shape matches `property` (R1.4):
 * - `position` → `[x, y]` tuple, each in [-32000, 32000]
 * - `scale` → positive number in (0, 100]
 * - `rotation` → finite number in [-3600, 3600]
 * - `opacity` → number in [0, 1]
 * - `blur` → number in [0, 100]
 * - `color` → hex color string
 */
function arbValueForProperty(
  property: KeyframeProperty,
): fc.Arbitrary<number | [number, number] | string> {
  switch (property) {
    case "position":
      return fc.tuple(
        fc.double({ min: -32000, max: 32000, noNaN: true }).map(normalizeZero),
        fc.double({ min: -32000, max: 32000, noNaN: true }).map(normalizeZero),
      );
    case "scale":
      // Strictly positive: use a small positive floor so 0 is never produced.
      return fc.double({ min: Number.MIN_VALUE, max: 100, noNaN: true }).map(normalizeZero);
    case "rotation":
      return fc.double({ min: -3600, max: 3600, noNaN: true }).map(normalizeZero);
    case "opacity":
      return fc.double({ min: 0, max: 1, noNaN: true }).map(normalizeZero);
    case "blur":
      return fc.double({ min: 0, max: 100, noNaN: true }).map(normalizeZero);
    case "color":
      return arbHexColor;
  }
}

/**
 * A single keyframe for `property` with `t` in `[0, maxLocalT]`. The value shape
 * is chosen to match `property` so the track-level superRefine accepts it.
 */
export function arbKeyframe(
  property: KeyframeProperty,
  maxLocalT: number,
): fc.Arbitrary<Keyframe> {
  const safeMax = maxLocalT > 0 ? maxLocalT : 0;
  return fc.record({
    t: fc.double({ min: 0, max: safeMax, noNaN: true }).map(normalizeZero),
    value: arbValueForProperty(property),
    easing: arbEasing,
  });
}

/**
 * A keyframe track with 1..5 keyframes whose `t` values are strictly increasing
 * and lie within `[0, maxLocalT]`.
 *
 * Strict monotonicity is guaranteed by construction rather than by generating
 * independent `t` values and hoping they differ: we generate a set of DISTINCT
 * integer "slots" in `[0, 1000]`, sort them, and map each slot linearly onto
 * `[0, maxLocalT]`. The map is monotonic non-decreasing, but when `maxLocalT` is
 * extremely small (subnormal) distinct slots can collapse to the same float and
 * break the strictly-increasing invariant. To stay correct for every possible
 * `maxLocalT`, we therefore DEDUPE the mapped times (keeping the sorted unique
 * set). Because slot `0` always maps to `0`, at least one time always survives,
 * so the track keeps its `>= 1` keyframe. The result is always strictly
 * increasing and every `t` is within `[0, maxLocalT]`.
 */
export function arbKeyframeTrack(maxLocalT: number): fc.Arbitrary<KeyframeTrack> {
  const safeMax = maxLocalT > 0 ? maxLocalT : 0;
  return fc
    .constantFrom(...KEYFRAME_PROPERTIES)
    .chain((property) =>
      fc
        .uniqueArray(fc.integer({ min: 0, max: 1000 }), {
          minLength: 1,
          maxLength: 5,
        })
        .chain((slots) => {
          const sorted = [...slots].sort((a, b) => a - b);
          const mapped = sorted.map((slot) => normalizeZero((slot / 1000) * safeMax));
          // Dedupe after the float map so subnormal collapse cannot produce two
          // equal t values (which would violate the strictly-increasing rule).
          const times = mapped.filter((t, i) => i === 0 || t > mapped[i - 1]);
          const keyframes = times.map((t) =>
            fc.record({
              t: fc.constant(t),
              value: arbValueForProperty(property),
              easing: arbEasing,
            }),
          );
          return fc.tuple(...keyframes);
        })
        .map((keyframes): KeyframeTrack => ({ property, keyframes: [...keyframes] })),
    );
}

/** A non-empty string capped for test speed (schema allows up to 2000). */
const arbNonEmptyText: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 });

/** A font weight the schema accepts (any string; use a realistic set). */
const arbFontWeight: fc.Arbitrary<string> = fc.constantFrom(
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "normal",
  "bold",
);

/** An anchor with each axis in [-32000, 32000]. */
const arbAnchor: fc.Arbitrary<{ x: number; y: number }> = fc.record({
  x: fc.double({ min: -32000, max: 32000, noNaN: true }).map(normalizeZero),
  y: fc.double({ min: -32000, max: 32000, noNaN: true }).map(normalizeZero),
});

/**
 * A text layer that fits inside `canvasDuration`.
 *
 * Timing is the delicate cross-field constraint: the schema requires
 * `0 <= startSeconds`, `endSeconds > startSeconds` (strict), and
 * `endSeconds <= canvasDuration`. Rather than picking two independent fractions
 * and hoping they do not collapse to the same float (distinct fractions can
 * still round to the same value, or produce a subnormal/zero gap that breaks
 * keyframe tracks), we build the pair CONSTRUCTIVELY so a strictly-positive gap
 * is guaranteed by the math:
 *
 *   minGap = clamp(canvasDuration * 1e-6, 1e-3, canvasDuration)
 *   start  = startFraction * (canvasDuration - minGap)   // leaves >= minGap room
 *   maxGap = canvasDuration - start                      // >= minGap by construction
 *   end    = start + minGap + gapFraction * (maxGap - minGap), clamped to canvasDuration
 *
 * We then EXPLICITLY VERIFY the pair (finite, 0 <= start < end <= duration) and
 * fall back to a guaranteed-valid `[0, minGap]` window if the FP arithmetic ever
 * overshoots. No `fc.filter` is used as the primary mechanism.
 *
 * Keyframe tracks are then generated with `maxLocalT = endSeconds -
 * startSeconds` (now `>= minGap`, strictly positive and non-subnormal), so every
 * keyframe `t` is within the layer-local range and the track dedupe never has to
 * collapse times in practice.
 *
 * `effectInstances` is always `[]` for Task 3.7.
 */
export function arbTextLayer(canvasDuration: number): fc.Arbitrary<TextLayer> {
  return fc
    .record({
      startFraction: fc.double({ min: 0, max: 1, noNaN: true }),
      gapFraction: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .chain(({ startFraction, gapFraction }) => {
      const minGap = Math.min(Math.max(canvasDuration * 1e-6, 1e-3), canvasDuration);
      // (canvasDuration - minGap) >= 0, so start stays in [0, canvasDuration].
      let startSeconds = normalizeZero(startFraction * (canvasDuration - minGap));
      const maxGap = canvasDuration - startSeconds; // >= minGap by construction
      let endSeconds = startSeconds + minGap + gapFraction * (maxGap - minGap);
      endSeconds = normalizeZero(Math.min(endSeconds, canvasDuration)); // clamp FP overshoot

      // Explicitly verify the pair instead of assuming the math held under FP.
      const ok =
        Number.isFinite(startSeconds) &&
        Number.isFinite(endSeconds) &&
        startSeconds >= 0 &&
        startSeconds < endSeconds &&
        endSeconds <= canvasDuration;
      if (!ok) {
        // Guaranteed-valid fallback: minGap > 0 and minGap <= canvasDuration.
        startSeconds = 0;
        endSeconds = minGap;
      }

      const localDuration = endSeconds - startSeconds;

      return fc
        .array(arbKeyframeTrack(localDuration), { minLength: 0, maxLength: 3 })
        .chain((tracks) =>
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            text: arbNonEmptyText,
            tracks: fc.constant(tracks),
            effectInstances: fc.constant([] as TextLayer["effectInstances"]),
            fontFamily: fc.string({ minLength: 1, maxLength: 20 }),
            fontSize: fc.double({ min: 1, max: 1000, noNaN: true }),
            fontWeight: arbFontWeight,
            fill: arbHexColor,
            align: fc.constantFrom("left" as const, "center" as const, "right" as const),
            letterSpacing: fc.double({ min: -500, max: 500, noNaN: true }).map(normalizeZero),
            lineHeight: fc.double({ min: 0.1, max: 10, noNaN: true }),
            maxWidth: fc.option(fc.double({ min: 1, max: 10000, noNaN: true }), {
              nil: null,
            }),
            startSeconds: fc.constant(startSeconds),
            endSeconds: fc.constant(endSeconds),
            anchor: arbAnchor,
          }),
        );
    }) as fc.Arbitrary<TextLayer>;
}

/** A project background: hex color or the literal "transparent". */
const arbBackground: fc.Arbitrary<string> = fc.oneof(
  arbHexColor,
  fc.constant("transparent"),
);

/**
 * A fully valid project with 1..8 layers. The canvas duration is generated
 * first with a comfortable range so layers and keyframes have room to fit, then
 * every layer is generated against that duration so the
 * `endSeconds <= canvas.durationSeconds` invariant always holds.
 */
export const arbValidProject: fc.Arbitrary<Project> = fc
  .record({
    width: fc.integer({ min: 1, max: 7680 }),
    height: fc.integer({ min: 1, max: 4320 }),
    fps: fc.integer({ min: 1, max: 120 }),
    durationSeconds: fc.double({ min: 1, max: 600, noNaN: true }),
  })
  .chain((canvas) =>
    fc
      .array(arbTextLayer(canvas.durationSeconds), { minLength: 1, maxLength: 8 })
      .chain((layers) =>
        fc.record({
          schemaVersion: fc.constant(1),
          canvas: fc.constant(canvas),
          background: arbBackground,
          seed: fc.integer(),
          layers: fc.constant(layers),
        }),
      ),
  ) as fc.Arbitrary<Project>;

/**
 * A project-like object that DELIBERATELY violates exactly one hard limit, so
 * `ProjectSchema.safeParse` reliably returns `{ success: false }`. Used by the
 * hard-limits rejection property (Task 3.10).
 *
 * Construction: start from a minimal valid project, then blow one randomly
 * chosen limit well past its bound. Each mutation is independently sufficient to
 * fail validation.
 */
export const arbOutOfBoundsProject: fc.Arbitrary<unknown> = fc
  .constantFrom(
    "width",
    "height",
    "fps",
    "duration",
    "layers",
    "textLength",
    "fontSize",
    "keyframeCount",
    "effectInstanceCount",
  )
  .chain((violation): fc.Arbitrary<unknown> => {
    const baseLayer = {
      id: "layer-1",
      text: "hello",
      tracks: [],
      effectInstances: [],
      fontFamily: "sans-serif",
      fontSize: 48,
      fontWeight: "400",
      fill: "#ffffff",
      align: "center",
      letterSpacing: 0,
      lineHeight: 1.2,
      maxWidth: null,
      startSeconds: 0,
      endSeconds: 1,
      anchor: { x: 0, y: 0 },
    };

    const base = {
      schemaVersion: 1,
      canvas: { width: 1920, height: 1080, fps: 30, durationSeconds: 10 },
      background: "#000000",
      seed: 0,
      layers: [baseLayer],
    };

    switch (violation) {
      case "width":
        return fc.constant({
          ...base,
          canvas: { ...base.canvas, width: 99999 },
        });
      case "height":
        return fc.constant({
          ...base,
          canvas: { ...base.canvas, height: 99999 },
        });
      case "fps":
        return fc.constant({
          ...base,
          canvas: { ...base.canvas, fps: 1000 },
        });
      case "duration":
        return fc.constant({
          ...base,
          canvas: { ...base.canvas, durationSeconds: 99999 },
        });
      case "layers":
        return fc.constant({
          ...base,
          // 65 layers exceeds the max of 64.
          layers: Array.from({ length: 65 }, (_unused, i) => ({
            ...baseLayer,
            id: `layer-${i}`,
          })),
        });
      case "textLength":
        return fc.constant({
          ...base,
          layers: [{ ...baseLayer, text: "a".repeat(3000) }],
        });
      case "keyframeCount": {
        // 501 keyframes exceeds the max of 500. To make the COUNT the sole
        // violation, use a large canvas duration and a layer spanning the full
        // duration, then place 501 strictly-increasing t values (t = i, i in
        // 0..500 → max t 500) comfortably inside the layer-local range
        // [0, 600]. Every value stays within the R1.4 opacity range [0, 1].
        const bigDuration = 600;
        const keyframes = Array.from({ length: 501 }, (_unused, i) => ({
          t: i,
          value: i % 2 === 0 ? 0 : 1,
          easing: "linear" as const,
        }));
        return fc.constant({
          ...base,
          canvas: { ...base.canvas, durationSeconds: bigDuration },
          layers: [
            {
              ...baseLayer,
              startSeconds: 0,
              endSeconds: bigDuration,
              tracks: [{ property: "opacity", keyframes }],
            },
          ],
        });
      }
      case "effectInstanceCount": {
        // 17 effect instances exceeds the max of 16. Each instance is valid, so
        // the COUNT is the sole violation.
        const effectInstances = Array.from({ length: 17 }, (_unused, i) => ({
          effectId: `effect-${i}`,
          granularity: "character" as const,
          params: {},
        }));
        return fc.constant({
          ...base,
          layers: [{ ...baseLayer, effectInstances }],
        });
      }
      case "fontSize":
      default:
        return fc.constant({
          ...base,
          layers: [{ ...baseLayer, fontSize: 5000 }],
        });
    }
  });

/** A kebab-case segment: a lowercase letter followed by lowercase letters/digits. */
const arbKebabSegment: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
    fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
      minLength: 0,
      maxLength: 6,
    }),
  )
  .map(([head, rest]) => head + rest.join(""));

/**
 * A kebab-case id matching `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`: 1..3 segments
 * joined by `-`. Each segment starts with a letter, so the whole id does too,
 * and no leading/trailing/doubled hyphens are possible.
 */
const arbKebabId: fc.Arbitrary<string> = fc
  .array(arbKebabSegment, { minLength: 1, maxLength: 3 })
  .map((segments) => segments.join("-"));

/** An effect instance with a kebab-case id, a granularity, and empty params. */
const arbEffectInstance = fc.record({
  effectId: arbKebabId,
  granularity: fc.constantFrom("character" as const, "word" as const, "line" as const),
  params: fc.constant({} as Record<string, unknown>),
});

/**
 * A param descriptor whose `binding.effectInstanceIndex` is guaranteed in range
 * because `instanceCount` is passed in and used to bound the index via
 * `fc.nat({ max: instanceCount - 1 })`. Variants mirror the schema's
 * discriminated union (number | enum | color).
 */
function arbParamDescriptor(instanceCount: number): fc.Arbitrary<unknown> {
  const arbBinding = fc.record({
    effectInstanceIndex: fc.nat({ max: instanceCount - 1 }),
    paramKey: fc.string({ minLength: 1, maxLength: 20 }),
  });

  const arbNumber = fc
    .tuple(fc.integer({ min: -1000, max: 0 }), fc.integer({ min: 1, max: 1000 }))
    .chain(([min, max]) =>
      fc.record({
        key: fc.string({ minLength: 1, maxLength: 20 }),
        type: fc.constant("number" as const),
        binding: arbBinding,
        min: fc.constant(min),
        max: fc.constant(max),
        default: fc.integer({ min, max }),
      }),
    );

  const arbEnum = fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), {
      minLength: 1,
      maxLength: 5,
    })
    .chain((values) =>
      fc.record({
        key: fc.string({ minLength: 1, maxLength: 20 }),
        type: fc.constant("enum" as const),
        binding: arbBinding,
        values: fc.constant(values),
        default: fc.constantFrom(...values),
      }),
    );

  const arbColor = fc.record({
    key: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constant("color" as const),
    binding: arbBinding,
    default: arbHexColor,
  });

  return fc.oneof(arbNumber, arbEnum, arbColor);
}

/**
 * A fully valid EffectPack. Instances are generated first so the descriptor
 * bindings can be constrained to `[0, instances.length - 1]`, guaranteeing the
 * schema's binding-bounds superRefine always passes.
 */
export const arbValidEffectPack: fc.Arbitrary<EffectPack> = fc
  .array(arbEffectInstance, { minLength: 1, maxLength: 3 })
  .chain((effectInstances) =>
    fc
      .array(arbParamDescriptor(effectInstances.length), { minLength: 0, maxLength: 5 })
      .chain((paramDescriptors) =>
        fc.record({
          schemaVersion: fc.integer({ min: 1, max: 1000 }),
          id: arbKebabId,
          displayName: fc.string({ minLength: 1, maxLength: 30 }),
          description: fc.string({ maxLength: 100 }),
          effectInstances: fc.constant(effectInstances),
          paramDescriptors: fc.constant(paramDescriptors),
        }),
      ),
  ) as fc.Arbitrary<EffectPack>;

/**
 * A time in `[0, project.canvas.durationSeconds]`, used by later compute PBTs.
 */
export function arbT(project: Project): fc.Arbitrary<number> {
  return fc.double({ min: 0, max: project.canvas.durationSeconds, noNaN: true });
}
