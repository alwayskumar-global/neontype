/**
 * Pure derived reads over a Project (no DOM, no clock).
 */

import type { Project, TextLayer } from "@studio/engine";

/** round-half-away-from-zero, matching the engine/exporters frame rule. */
export function roundHalfAwayFromZero(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** Total frame count: round(durationSeconds * fps). */
export function frameCountFor(project: Project): number {
  return roundHalfAwayFromZero(project.canvas.durationSeconds * project.canvas.fps);
}

/** The time (seconds) of frame `index` at the project fps. */
export function timeOfFrame(project: Project, index: number): number {
  return index / project.canvas.fps;
}

/** The layer with `id`, or undefined. */
export function layerById(project: Project, id: string): TextLayer | undefined {
  return project.layers.find((l) => l.id === id);
}

/** Layers active at time `t` (startSeconds <= t < endSeconds, end-inclusive at duration). */
export function activeLayers(project: Project, t: number): TextLayer[] {
  const d = project.canvas.durationSeconds;
  return project.layers.filter(
    (l) => t >= l.startSeconds && (t < l.endSeconds || (t === l.endSeconds && l.endSeconds === d)),
  );
}
