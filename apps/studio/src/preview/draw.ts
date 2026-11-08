/**
 * Thin preview painter (Requirement 1, 9). The preview renders through the
 * EXPORTER's FrameRenderer — the exact path every export uses — so the preview
 * and exports produce identical frames, including blur (the FrameRenderer wraps
 * the engine in the FilterStrippingContext and composites the deterministic
 * blur; the studio never sets a browser ctx.filter blur for the final output).
 * A FrameRenderer owns its own metrics provider and blur layers; one per preview
 * canvas, none shared with any export.
 */
import type { Project } from "@studio/engine";
import { FrameRenderer, makeOffscreenLayerFactory } from "../../../../packages/exporters/src/render-frame.js";

/** Builds a preview FrameRenderer for a project's canvas size (no scaling). */
export function makePreviewRenderer(project: Project): FrameRenderer {
  const { width, height } = project.canvas;
  const plan = {
    canvasWidth: width,
    canvasHeight: height,
    outputWidth: width,
    outputHeight: height,
    scale: 1,
    needsScaling: false,
  };
  return new FrameRenderer(plan, makeOffscreenLayerFactory());
}

/** Draws project@t onto the preview 2D context via the exporter FrameRenderer. */
export function drawPreviewFrame(
  renderer: FrameRenderer,
  ctx: CanvasRenderingContext2D,
  project: Project,
  t: number,
): void {
  renderer.render(project, t, ctx as unknown as OffscreenCanvasRenderingContext2D);
}
