/**
 * `computeFrameState` — the pure, deterministic core of the render pipeline.
 *
 * `computeFrameState(project, t, opts)` turns a validated `Project` and a time
 * `t` (seconds) into a fully resolved, JSON-serialisable `FrameState`: the
 * active layers, their interpolated transforms, their laid-out grapheme-cluster
 * segments, and the composed effect overrides for each segment. `drawFrame`
 * (Group 9) is a thin painter that consumes this state; all interpolation,
 * easing, segmentation, layout, and effect composition happen here.
 *
 * Purity & determinism (R5.5, R5.13): this module calls only the imported pure
 * helpers plus `Math.min`/`Math.max`/`Number.isFinite`/`Object.is`. It never
 * touches `Math.random`, `Date.now`, `performance.now`, the DOM, or the
 * network. The same `(project, t)` always yields identical output in the same
 * runtime, and the function NEVER throws for any valid `Project`: every call to
 * an effect's `applyEffect` is wrapped in try/catch, and non-finite override
 * values are discarded with a warning rather than propagated.
 *
 * Pipeline (R5.4–R5.11, R5.13, R5.14, R7.5, R15.1, R15.2):
 *   1. Clamp `t`: NaN / ±Infinity → 0; `< 0` → 0; `> durationSeconds` →
 *      `durationSeconds`.
 *   2. Select active layers via the half-open interval rule, with end-of-
 *      timeline inclusivity.
 *   3. Per active layer: interpolate keyframe tracks into the layer transform;
 *      segment + lay out the text; apply each effect instance at its
 *      granularity; compose per-segment overrides.
 *   4. Emit an `UnknownEffect` warning for any effect id the registry does not
 *      know.
 *   5. Normalise `-0` → `+0` across the whole assembled `FrameState`.
 */

import { interpolateTrack } from "./interpolate.js";
import { segmentText } from "./segment.js";
import { layoutSegments, type LayoutGeometry } from "./layout.js";
import { derivePRNG } from "./prng.js";
import { builtinRegistry } from "./effects/index.js";
import type { Project, TextLayer } from "./schemas/project.js";
import type { EffectInstance } from "./schemas/effect-instance.js";
import type {
  EffectRegistry,
  SegmentOverrides,
  ApplyEffectArgs,
} from "./registry.js";
import type { TextMetricsProvider } from "./metrics.js";

/**
 * One grapheme cluster with its layout geometry and the composed overrides from
 * every effect that targets it. `effectOverrides` is `null` when no effect
 * contributed any property to this segment; otherwise it is a partial
 * `SegmentOverrides` holding exactly the composed properties.
 */
export interface BaseSegment {
  /** The grapheme cluster string (may be multiple codepoints). */
  text: string;
  /** 0-based running cluster index in the layer text (includes `\n`). */
  charIndex: number;
  /** 0-based word index of the cluster. */
  wordIndex: number;
  /** 0-based line index of the cluster. */
  lineIndex: number;
  /** px, relative to the layer anchor (top-left of first character origin). */
  layoutX: number;
  layoutY: number;
  /** Measured advance width in px. */
  width: number;
  /** Full vertical box (`ascent + descent`) in px. */
  height: number;
  /** Composed overrides from all effects, or `null` if none applied. */
  effectOverrides: SegmentOverrides | null;
}

/** The interpolated per-layer transform plus its resolved segments. */
export interface LayerState {
  layerId: string;
  /** Fill color `#rrggbb`; copied verbatim from the layer. */
  fill: string;
  /** Font family; copied verbatim from the layer. */
  fontFamily: string;
  /** Font size in px; copied verbatim from the layer. */
  fontSize: number;
  /** Font weight (e.g. `"400"`, `"bold"`); copied verbatim from the layer. */
  fontWeight: string;
  /** Horizontal text alignment; copied verbatim from the layer. */
  align: "left" | "center" | "right";
  /** Layer anchor in canvas coordinates; a fresh plain `{ x, y }` copied from the layer. */
  anchor: { x: number; y: number };
  /** Per-cluster letter spacing in px; copied verbatim from the layer. */
  letterSpacing: number;
  /** Line height multiplier; copied verbatim from the layer. */
  lineHeight: number;
  transform: {
    /** From the `position` track; default `[0, 0]`. */
    positionOffset: [number, number];
    /** From the `scale` track; default `1`. */
    scale: number;
    /** Degrees; from the `rotation` track; default `0`. */
    rotation: number;
    /** `[0, 1]`; from the `opacity` track; default `1`. */
    opacity: number;
    /** px; from the `blur` track; default `0`. */
    blur: number;
    /** From the `color` track; `null` when there is no color track. */
    colorOverride: string | null;
  };
  segments: BaseSegment[];
}

/** A resolved, JSON-serialisable frame: canvas size, active layers, warnings. */
export interface FrameState {
  canvasWidth: number;
  canvasHeight: number;
  /**
   * The project background: either the literal `"transparent"` or a `#rrggbb`
   * hex string, copied verbatim from `project.background`. Kept as a plain
   * string so `FrameState` stays JSON-serialisable.
   */
  background: string;
  layers: LayerState[];
  warnings: EngineWarning[];
}

/** An effect instance referenced an id the registry does not know. */
export type UnknownEffectWarning = {
  type: "UnknownEffect";
  effectId: string;
  layerId: string;
};

/**
 * An effect's `applyEffect` threw, or returned a non-finite numeric override,
 * for the group whose representative segment is `segmentIndex`.
 */
export type InvalidEffectParamsWarning = {
  type: "InvalidEffectParams";
  effectId: string;
  layerId: string;
  segmentIndex: number;
};

/** A non-fatal issue surfaced while computing a frame. */
export type EngineWarning = UnknownEffectWarning | InvalidEffectParamsWarning;

/**
 * Options for `computeFrameState`.
 *
 * - `metricsProvider` (required): measures text; injected so the function runs
 *   headlessly in Node (via `FakeMetricsProvider`) and in the browser (via
 *   `CanvasMetricsProvider`).
 * - `registry` (optional): the effect registry; defaults to `builtinRegistry`.
 * - `layoutCache` (optional): caller-owned layout memoization map; a fresh
 *   `Map` is created per call when omitted (so a lone call still benefits from
 *   intra-call reuse across layers that share layout params).
 */
export interface ComputeOpts {
  metricsProvider: TextMetricsProvider;
  registry?: EffectRegistry;
  layoutCache?: Map<string, LayoutGeometry[]>;
}

/**
 * A mutable accumulator for composing overrides onto a single base segment
 * across all of a layer's effect instances. Each `has*` flag records whether
 * any effect ever set the corresponding property, so the final `effectOverrides`
 * is `null` (nothing set) or a partial object holding exactly the set fields.
 */
interface OverrideAccumulator {
  hasOpacity: boolean;
  opacity: number; // product of all opacity overrides, clamped at the end
  hasPositionOffset: boolean;
  positionOffset: [number, number]; // sum of all positionOffset overrides
  hasScale: boolean;
  scale: number; // last-writer-wins
  hasRotation: boolean;
  rotation: number; // last-writer-wins
  hasBlur: boolean;
  blur: number; // last-writer-wins
  hasColor: boolean;
  color: string; // last-writer-wins
}

/** Creates an empty accumulator (opacity identity is 1, offset identity [0,0]). */
function createAccumulator(): OverrideAccumulator {
  return {
    hasOpacity: false,
    opacity: 1,
    hasPositionOffset: false,
    positionOffset: [0, 0],
    hasScale: false,
    scale: 1,
    hasRotation: false,
    rotation: 0,
    hasBlur: false,
    blur: 0,
    hasColor: false,
    color: "#000000",
  };
}

/** The layer transform, built from the layer's keyframe tracks. */
type LayerTransform = LayerState["transform"];

/**
 * Builds the layer transform by interpolating each keyframe track at `tLocal`.
 * Defaults come first; if the schema allows multiple tracks for one property,
 * the last track in array order wins. `colorOverride` stays `null` unless a
 * `color` track is present.
 */
function buildTransform(layer: TextLayer, tLocal: number): LayerTransform {
  const transform: LayerTransform = {
    positionOffset: [0, 0],
    scale: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    colorOverride: null,
  };

  for (const track of layer.tracks) {
    const value = interpolateTrack(track, tLocal);
    switch (track.property) {
      case "position":
        transform.positionOffset = value as [number, number];
        break;
      case "scale":
        transform.scale = value as number;
        break;
      case "rotation":
        transform.rotation = value as number;
        break;
      case "opacity":
        transform.opacity = value as number;
        break;
      case "blur":
        transform.blur = value as number;
        break;
      case "color":
        transform.colorOverride = value as string;
        break;
    }
  }

  return transform;
}

/**
 * Groups base-segment indices by the effect instance's granularity.
 *
 * - `character`: each cluster is its own group, in cluster order.
 * - `word`: clusters sharing a `wordIndex` form one group.
 * - `line`: clusters sharing a `lineIndex` form one group.
 *
 * Returns groups in first-appearance order. Each group carries the ordered list
 * of member base-segment indices; `groupCount` is the number of groups and a
 * member's `groupIndex` is the group's position in this list.
 */
function groupSegments(
  segments: BaseSegment[],
  granularity: EffectInstance["granularity"],
): number[][] {
  if (granularity === "character") {
    return segments.map((_, i) => [i]);
  }

  const key = granularity === "word" ? "wordIndex" : "lineIndex";
  const groups: number[][] = [];
  const indexByKey = new Map<number, number>();

  for (let i = 0; i < segments.length; i++) {
    const k = segments[i][key];
    const existing = indexByKey.get(k);
    if (existing === undefined) {
      indexByKey.set(k, groups.length);
      groups.push([i]);
    } else {
      groups[existing].push(i);
    }
  }

  return groups;
}

/**
 * Folds one effect's `SegmentOverrides` into a base segment's accumulator,
 * discarding any non-finite numeric field (and reporting how many were
 * discarded, so the caller can emit a warning). Composition rules (R5 design):
 * opacity multiplies, `positionOffset` adds, and `scale`/`rotation`/`blur`/
 * `color` are last-writer-wins.
 *
 * Returns the count of non-finite numeric fields discarded for this override.
 */
function foldOverride(acc: OverrideAccumulator, ov: SegmentOverrides): number {
  let discarded = 0;

  if (ov.opacity !== undefined) {
    if (Number.isFinite(ov.opacity)) {
      acc.hasOpacity = true;
      acc.opacity *= ov.opacity;
    } else {
      discarded += 1;
    }
  }

  if (ov.positionOffset !== undefined) {
    const [dx, dy] = ov.positionOffset;
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      acc.hasPositionOffset = true;
      acc.positionOffset[0] += dx;
      acc.positionOffset[1] += dy;
    } else {
      discarded += 1;
    }
  }

  if (ov.scale !== undefined) {
    if (Number.isFinite(ov.scale)) {
      acc.hasScale = true;
      acc.scale = ov.scale;
    } else {
      discarded += 1;
    }
  }

  if (ov.rotation !== undefined) {
    if (Number.isFinite(ov.rotation)) {
      acc.hasRotation = true;
      acc.rotation = ov.rotation;
    } else {
      discarded += 1;
    }
  }

  if (ov.blur !== undefined) {
    if (Number.isFinite(ov.blur)) {
      acc.hasBlur = true;
      acc.blur = ov.blur;
    } else {
      discarded += 1;
    }
  }

  if (ov.color !== undefined) {
    acc.hasColor = true;
    acc.color = ov.color;
  }

  return discarded;
}

/**
 * Finalises an accumulator into the `effectOverrides` value for a segment:
 * `null` when no effect set anything, otherwise a partial `SegmentOverrides`
 * holding exactly the composed fields. Final opacity is clamped to `[0, 1]`.
 */
function finalizeOverrides(acc: OverrideAccumulator): SegmentOverrides | null {
  const result: SegmentOverrides = {};
  let any = false;

  if (acc.hasOpacity) {
    result.opacity = Math.min(1, Math.max(0, acc.opacity));
    any = true;
  }
  if (acc.hasPositionOffset) {
    result.positionOffset = [acc.positionOffset[0], acc.positionOffset[1]];
    any = true;
  }
  if (acc.hasScale) {
    result.scale = acc.scale;
    any = true;
  }
  if (acc.hasRotation) {
    result.rotation = acc.rotation;
    any = true;
  }
  if (acc.hasBlur) {
    result.blur = acc.blur;
    any = true;
  }
  if (acc.hasColor) {
    result.color = acc.color;
    any = true;
  }

  return any ? result : null;
}

/**
 * Recursively replaces every `-0` with `+0` in a value, walking numbers,
 * arrays, and plain objects. Strings, booleans, and `null` pass through
 * unchanged. Mutates in place and returns the same reference for arrays and
 * objects; returns a normalised primitive for numbers.
 */
function normalizeNegativeZero<T>(value: T): T {
  if (typeof value === "number") {
    return (Object.is(value, -0) ? 0 : value) as T;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = normalizeNegativeZero(value[i]);
    }
    return value;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      record[k] = normalizeNegativeZero(record[k]);
    }
    return value;
  }
  return value;
}

/**
 * Computes the fully resolved `FrameState` for `project` at time `t`.
 *
 * See the module docstring for the pipeline and purity guarantees. For any
 * valid `Project` this function returns a JSON-serialisable `FrameState` and
 * never throws.
 */
export function computeFrameState(
  project: Project,
  t: number,
  opts: ComputeOpts,
): FrameState {
  const registry = opts.registry ?? builtinRegistry;
  const metricsProvider = opts.metricsProvider;
  const cache = opts.layoutCache ?? new Map<string, LayoutGeometry[]>();

  const durationSeconds = project.canvas.durationSeconds;

  // Step 1: clamp t. NaN and ±Infinity fail Number.isFinite → 0; negative → 0;
  // beyond the timeline → durationSeconds.
  let tc = t;
  if (!Number.isFinite(tc) || tc < 0) {
    tc = 0;
  } else if (tc > durationSeconds) {
    tc = durationSeconds;
  }

  const warnings: EngineWarning[] = [];
  const layers: LayerState[] = [];

  for (const layer of project.layers) {
    // Step 2: active-layer filter (half-open, end-of-timeline inclusive).
    const active =
      tc >= layer.startSeconds &&
      (tc < layer.endSeconds ||
        (tc === layer.endSeconds && layer.endSeconds === durationSeconds));
    if (!active) {
      continue;
    }

    // Step 3a: layer-local time.
    const tLocal = tc - layer.startSeconds;

    // Step 3b: interpolate keyframe tracks into the layer transform.
    const transform = buildTransform(layer, tLocal);

    // Step 3c: segment and lay out the text (geometry only, memoized).
    const tokens = segmentText(layer.text);
    const geom = layoutSegments(tokens, layer, metricsProvider, cache);

    // Build the base segments (geometry + indices) with empty accumulators.
    const segments: BaseSegment[] = tokens.map((token, i) => ({
      text: token.text,
      charIndex: token.charIndex,
      wordIndex: token.wordIndex,
      lineIndex: token.lineIndex,
      layoutX: geom[i].layoutX,
      layoutY: geom[i].layoutY,
      width: geom[i].width,
      height: geom[i].height,
      effectOverrides: null,
    }));
    const accumulators = segments.map(() => createAccumulator());

    // Step 3d: apply each effect instance at its granularity, composing
    // overrides onto every member base segment.
    for (
      let effectInstanceIndex = 0;
      effectInstanceIndex < layer.effectInstances.length;
      effectInstanceIndex++
    ) {
      const inst = layer.effectInstances[effectInstanceIndex];
      const def = registry.get(inst.effectId);

      // Step 4: unknown effect id → warn once, apply nothing.
      if (def === undefined) {
        warnings.push({
          type: "UnknownEffect",
          effectId: inst.effectId,
          layerId: layer.id,
        });
        continue;
      }

      const groups = groupSegments(segments, inst.granularity);
      const groupCount = groups.length;

      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        const members = groups[groupIndex];
        // Representative segment: the group's first member. Its charIndex also
        // serves as the PRNG `segmentIndex` and the warning `segmentIndex`.
        const repIndex = members[0];
        const rep = segments[repIndex];
        const segmentIndex = rep.charIndex;

        const groupText = members.map((m) => segments[m].text).join("");

        const args: ApplyEffectArgs = {
          groupText,
          charIndex: rep.charIndex,
          wordIndex: rep.wordIndex,
          lineIndex: rep.lineIndex,
          groupIndex,
          groupCount,
          t: tLocal,
          params: inst.params,
          prng: derivePRNG(
            project.seed,
            layer.id,
            effectInstanceIndex,
            inst.granularity,
            segmentIndex,
          ),
        };

        // computeFrameState must be total: catch ANY throw (InvalidEffectParams
        // or otherwise) and record a warning instead of propagating (R5.13).
        // Any throw — an `InvalidEffectParamsError` from param validation or any
        // other error — is caught and recorded as an `InvalidEffectParams`
        // warning rather than propagated, keeping the function total (R5.13).
        let overrides: SegmentOverrides | undefined;
        try {
          overrides = def.applyEffect(args);
        } catch {
          warnings.push({
            type: "InvalidEffectParams",
            effectId: inst.effectId,
            layerId: layer.id,
            segmentIndex,
          });
          continue;
        }

        // Compose onto every member; discard non-finite numeric overrides and
        // warn once per group when any were discarded (R5.13).
        let discardedForGroup = 0;
        for (const memberIndex of members) {
          discardedForGroup = foldOverride(accumulators[memberIndex], overrides);
        }
        if (discardedForGroup > 0) {
          warnings.push({
            type: "InvalidEffectParams",
            effectId: inst.effectId,
            layerId: layer.id,
            segmentIndex,
          });
        }
      }
    }

    // Finalise composed overrides onto each base segment.
    for (let i = 0; i < segments.length; i++) {
      segments[i].effectOverrides = finalizeOverrides(accumulators[i]);
    }

    // Copy the layer's text-style fields verbatim (no computation) so drawFrame
    // can be a pure painter. anchor is copied as a fresh plain { x, y } object
    // rather than the schema reference, keeping FrameState JSON-serialisable.
    layers.push({
      layerId: layer.id,
      fill: layer.fill,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      align: layer.align,
      anchor: { x: layer.anchor.x, y: layer.anchor.y },
      letterSpacing: layer.letterSpacing,
      lineHeight: layer.lineHeight,
      transform,
      segments,
    });
  }

  // Step 5: assemble and normalise -0 → +0 across the whole FrameState.
  const state: FrameState = {
    canvasWidth: project.canvas.width,
    canvasHeight: project.canvas.height,
    background: project.background,
    layers,
    warnings,
  };

  return normalizeNegativeZero(state);
}
