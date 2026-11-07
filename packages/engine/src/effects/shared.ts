/**
 * Small pure helpers shared by the built-in preset effects.
 *
 * These exist only to avoid re-deriving the same clamp and staggered-progress
 * arithmetic in every effect's `applyEffect`. They introduce no new types to the
 * engine's public surface and touch neither the registry nor `SegmentOverrides`.
 * Pure: no `Math.random`, `Date.now`, `performance.now`, DOM, or network.
 */

/**
 * Clamps `n` to the closed interval `[lo, hi]` and normalizes `-0` to `+0`.
 * Assumes `n` is finite. The `-0 → +0` normalization keeps effect outputs
 * matching the exact identity state (`0`, not `-0`) and is consistent with the
 * engine's own `-0` normalization in `computeFrameState`.
 */
export function clamp(n: number, lo: number, hi: number): number {
  const c = Math.min(hi, Math.max(lo, n));
  return c === 0 ? 0 : c;
}

/**
 * The shared staggered-progress convention used by the timed effects:
 *
 *   p = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
 *
 * `durationSeconds` is schema-guaranteed `>= 0.001`, so the division is always
 * finite. The result is in `[0, 1]`.
 */
export function staggeredProgress(
  t: number,
  startDelay: number,
  groupIndex: number,
  delayPerGroup: number,
  durationSeconds: number,
): number {
  return clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1);
}
