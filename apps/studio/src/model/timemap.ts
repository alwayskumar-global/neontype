/**
 * Pure time<->pixel mapping for the timeline (Property 2). No DOM, no clock.
 *
 * The axis spans [0, durationSeconds] across `axisWidthPx` pixels. `timeToX` and
 * `xToTime` are inverse within one pixel.
 */

/** Maps a time (seconds) to an x offset (pixels) on the axis. */
export function timeToX(t: number, axisWidthPx: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || axisWidthPx <= 0) return 0;
  const clamped = Math.max(0, Math.min(durationSeconds, t));
  return (clamped / durationSeconds) * axisWidthPx;
}

/** Maps an x offset (pixels) to a time (seconds), clamped to [0, duration]. */
export function xToTime(x: number, axisWidthPx: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || axisWidthPx <= 0) return 0;
  const clampedX = Math.max(0, Math.min(axisWidthPx, x));
  return (clampedX / axisWidthPx) * durationSeconds;
}
