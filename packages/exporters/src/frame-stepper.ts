/**
 * Deterministic frame stepping (Req 1).
 *
 * The stepper is the ONLY source of frame timing: frame `i` is rendered at
 * `t = i / fps`, never from a wall-clock source (`Date.now`/`performance.now`/
 * `requestAnimationFrame` are banned here and by lint). `frameCount` is
 * `round(durationSeconds * fps)` with round-half-away-from-zero. One metrics
 * provider instance is created per export and reused for every frame so layout
 * cannot vary across frames (Req 1.5).
 */

import type { Project, TextMetricsProvider } from "@studio/engine";

import type { ExportResult } from "./types.js";
import { fail } from "./errors.js";

/** A single frame to render: its index and its layer-local-free global time. */
export interface FrameJob {
  index: number;
  /** Seconds; `index / fps`. */
  t: number;
}

/**
 * Rounds half away from zero (so `round(0.5) === 1`), matching Req 1.2.
 * `Math.round` rounds half UP (toward +Infinity), which differs for negatives;
 * frame math is non-negative, but we implement the stated rule exactly.
 */
export function roundHalfAwayFromZero(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** The total frame count for a project: `round(durationSeconds * fps)`. */
export function frameCountFor(durationSeconds: number, fps: number): number {
  return roundHalfAwayFromZero(durationSeconds * fps);
}

/**
 * Yields the ordered frame jobs for a project. Pure and deterministic: the
 * sequence depends only on `durationSeconds` and `fps`. Indices run `[0,
 * frameCount - 1]`.
 */
export function* frameJobs(durationSeconds: number, fps: number): Generator<FrameJob> {
  const count = frameCountFor(durationSeconds, fps);
  for (let index = 0; index < count; index++) {
    yield { index, t: index / fps };
  }
}

/** Font-readiness timeout in milliseconds (Req 1.7). */
export const FONT_READY_TIMEOUT_MS = 30_000;

/**
 * Awaits font readiness with a 30-second timeout (Req 1.6, 1.7). `whenReady` is
 * injected (e.g. `document.fonts.ready`) so the stepper stays testable and
 * reads no wall-clock itself. Resolves `true` when ready in time, `false` on
 * timeout. Uses `setTimeout` only (a scheduler, not a clock read).
 */
export function awaitFontsReady(
  whenReady: Promise<unknown>,
  timeoutMs: number = FONT_READY_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);
    void whenReady.then(
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      },
    );
  });
}

/** The per-export rendering context shared across all frames (Req 1.5). */
export interface StepContext {
  project: Project;
  fps: number;
  durationSeconds: number;
  frameCount: number;
  /** The single metrics provider instance used for the whole export. */
  metricsProvider: TextMetricsProvider;
}

/**
 * Validates the frame range for an export (Req 1.3). Returns an
 * `empty-frame-range` failure when `frameCount < 1`, else `null`.
 */
export function validateFrameRange(durationSeconds: number, fps: number): ExportResult | null {
  const count = frameCountFor(durationSeconds, fps);
  if (count < 1) {
    return fail("empty-frame-range", "The export resolves to zero frames.");
  }
  return null;
}
