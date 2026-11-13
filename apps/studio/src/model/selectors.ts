/**
 * Pure derived reads over a Project (no DOM, no clock).
 */

import type { Project } from "@studio/engine";

/** round-half-away-from-zero, matching the engine/exporters frame rule. */
export function roundHalfAwayFromZero(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** Total frame count: round(durationSeconds * fps). */
export function frameCountFor(project: Project): number {
  return roundHalfAwayFromZero(project.canvas.durationSeconds * project.canvas.fps);
}
