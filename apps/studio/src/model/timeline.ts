/**
 * Pure timeline math (Requirement 5, Properties 2 and 8). No DOM, no clock, no
 * randomness. Everything is computed in WHOLE FRAMES and converted back to
 * seconds rounded to 1e-6, so every time the timeline writes lies on the frame grid.
 */
import { xToTime } from "./timemap.js";

export type Timing = { startSeconds: number; endSeconds: number };
export type TimingKind = "move" | "start" | "end";
export type AxisGeometry = { axisWidthPx: number; durationSeconds: number; fps: number };

/** round-half-away-from-zero(seconds * fps). */
export function toFrames(seconds: number, fps: number): number {
  const v = seconds * fps;
  return Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
}

/** frames / fps rounded to 1e-6. */
export function toSeconds(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1e6) / 1e6;
}

/** The last whole frame that fits inside the duration. */
export function lastFrame(durationSeconds: number, fps: number): number {
  return Math.floor(durationSeconds * fps + 1e-9);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Drags a layer's timing by `deltaFrames`. Snaps the input onto the grid first
 * (so off-grid times are repaired on the first interaction). A duration shorter
 * than one frame has no valid timing, so the input is returned unchanged.
 */
export function dragTiming(
  kind: TimingKind,
  start: Timing,
  deltaFrames: number,
  fps: number,
  durationSeconds: number,
): Timing {
  const N = lastFrame(durationSeconds, fps);
  if (!(N >= 1) || !(fps > 0)) return start;
  const d = Number.isFinite(deltaFrames) ? Math.trunc(deltaFrames) : 0;
  const s0 = clamp(toFrames(start.startSeconds, fps), 0, N - 1);
  const e0 = clamp(toFrames(start.endSeconds, fps), s0 + 1, N);
  let s = s0;
  let e = e0;
  if (kind === "move") {
    const len = e0 - s0;
    s = clamp(s0 + d, 0, N - len);
    e = s + len;
  } else if (kind === "start") {
    s = clamp(s0 + d, 0, e0 - 1);
  } else {
    e = clamp(e0 + d, s0 + 1, N);
  }
  return { startSeconds: toSeconds(s, fps), endSeconds: toSeconds(e, fps) };
}

/** Keyboard nudge: the same math as a drag by `frames`. */
export function nudgeTiming(
  kind: TimingKind,
  timing: Timing,
  frames: number,
  fps: number,
  durationSeconds: number,
): Timing {
  return dragTiming(kind, timing, frames, fps, durationSeconds);
}

/** Ruler pixel -> frame-snapped seconds, clamped to [0, last frame]. */
export function pxToSeconds(px: number, g: AxisGeometry): number {
  const N = lastFrame(g.durationSeconds, g.fps);
  const t = xToTime(px, g.axisWidthPx, g.durationSeconds);
  const frame = clamp(toFrames(t, g.fps), 0, Math.max(0, N));
  return toSeconds(frame, g.fps);
}
