/**
 * Keyframe track interpolation.
 *
 * `interpolateTrack(track, tLocal)` evaluates a single keyframe track at a
 * layer-local time `tLocal` (seconds) and returns the interpolated value.
 *
 * Boundary semantics (R5.11):
 * - `tLocal` before the first keyframe (`tLocal < kf[0].t`) returns the first
 *   keyframe's value (hold).
 * - `tLocal` at or after the last keyframe (`tLocal >= kf[last].t`) returns the
 *   last keyframe's value (hold).
 * - Otherwise the active interval is `[kf_i, kf_{i+1}]` with
 *   `kf_i.t <= tLocal < kf_{i+1}.t`, and the eased progress is
 *   `p = (tLocal - kf_i.t) / (kf_{i+1}.t - kf_i.t)`.
 *
 * Easing choice: a keyframe's `easing` defines the curve for the interval
 * LEAVING that keyframe, so the interval `[kf_i, kf_{i+1}]` uses `kf_i.easing`
 * (the start keyframe's easing). `evaluate` is reused for all numeric blending,
 * so step/cubic-bezier/etc. behaviour matches the rest of the engine.
 *
 * At an exact interior boundary `tLocal === kf_i.t`, the interval starting at
 * `kf_i` is selected with `p = 0`, and `evaluate(..., p = 0)` returns exactly
 * `kf_i.value` — so boundaries return that keyframe's value.
 *
 * Value types:
 * - `position`: a `[x, y]` tuple — each component is eased independently.
 * - `scale` / `rotation` / `opacity` / `blur`: a single number.
 * - `color`: a `#rrggbb` hex string — interpolated per-channel in sRGB,
 *   each channel in `[0, 255]`, rounded to the nearest integer, and re-encoded
 *   as lowercase `#rrggbb`.
 *
 * This module is pure and deterministic: it never calls `Math.random`,
 * `Date.now`, `performance.now`, reads the DOM, or performs any I/O. `Math.min`,
 * `Math.max`, and `Math.round` are the only `Math` helpers used.
 *
 * Rounding note: channels are interpolated into the non-negative range
 * `[0, 255]`, so `Math.round` IS standard half-up rounding here (`Math.round`
 * rounds halves toward +Infinity; for non-negative inputs that is half-up).
 * E.g. `Math.round(127.5) === 128`.
 */

import { evaluate } from "./easing.js";
import type { KeyframeTrackSchema } from "./schemas/keyframe.js";
import type { z } from "zod";

/**
 * A keyframe track, inferred from `KeyframeTrackSchema` (the single source of
 * truth in `schemas/keyframe.ts`).
 */
type KeyframeTrack = z.infer<typeof KeyframeTrackSchema>;

/**
 * The value a track interpolates to. The schema does not export a dedicated
 * value type, so it is defined locally here: a `[x, y]` tuple (position), a
 * number (scale/rotation/opacity/blur), or a `#rrggbb` hex string (color).
 */
export type KeyframeValue = [number, number] | number | string;

/** Parses a `#rrggbb` hex string into its R, G, B channels (each 0–255). */
function parseHex(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Rounds a continuous channel value to the nearest integer (standard half-up,
 * since channels are non-negative), clamps it to `[0, 255]` to guard against
 * any easing overshoot, and formats it as a two-digit lowercase hex pair.
 */
function channelToHex(value: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

/**
 * Interpolates two `#rrggbb` colors per-channel in sRGB at eased progress `p`,
 * using `easing` for each channel, and re-encodes the result as `#rrggbb`.
 */
function interpolateColor(from: string, to: string, easing: KeyframeTrack["keyframes"][number]["easing"], p: number): string {
  const [ar, ag, ab] = parseHex(from);
  const [br, bg, bb] = parseHex(to);
  const r = channelToHex(evaluate(easing, ar, br, p));
  const g = channelToHex(evaluate(easing, ag, bg, p));
  const b = channelToHex(evaluate(easing, ab, bb, p));
  return `#${r}${g}${b}`;
}

/**
 * Evaluates `track` at layer-local time `tLocal` and returns the interpolated
 * value. See the module docstring for the boundary, easing, and value-type
 * semantics.
 */
export function interpolateTrack(track: KeyframeTrack, tLocal: number): KeyframeValue {
  const { keyframes } = track;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  // Hold before the first and at/after the last keyframe. A single-keyframe
  // track collapses to both branches and always returns that keyframe's value.
  if (tLocal <= first.t) return first.value as KeyframeValue;
  if (tLocal >= last.t) return last.value as KeyframeValue;

  // Find the interval [kf_i, kf_{i+1}] with kf_i.t <= tLocal < kf_{i+1}.t.
  // Keyframes are guaranteed strictly increasing in `t` by the schema.
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].t <= tLocal) {
    i++;
  }
  const start = keyframes[i];
  const end = keyframes[i + 1];

  // The interval leaving `start` uses `start.easing`.
  const easing = start.easing;
  const p = (tLocal - start.t) / (end.t - start.t);

  if (track.property === "position") {
    const a = start.value as [number, number];
    const b = end.value as [number, number];
    return [evaluate(easing, a[0], b[0], p), evaluate(easing, a[1], b[1], p)];
  }

  if (track.property === "color") {
    return interpolateColor(start.value as string, end.value as string, easing, p);
  }

  // scale / rotation / opacity / blur: single number.
  return evaluate(easing, start.value as number, end.value as number, p);
}
