/**
 * Preview canvas (Requirement 1, 2, 9). Owns the <canvas> at project pixel size
 * and ONE CanvasMetricsProvider. The playback clock drives per-frame draws
 * directly (no React re-render per frame); React re-renders only when the
 * project structurally changes. CSS fits the canvas to its container so preview
 * pixels equal export pixels (parity). A checkerboard shows transparency.
 */
import { useEffect, type RefObject } from "react";
import type { Project } from "@studio/engine";

import { PlaybackClock } from "../playback/clock.js";
import { drawPreviewFrame, makePreviewRenderer } from "./draw.js";
import type { Store } from "../shell/store.js";

export function PreviewCanvas({ store, canvasRef }: { store: Store; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const { project } = store.getState();
  const { width, height } = project.canvas;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let renderer = makePreviewRenderer(store.getState().project);
    let rendererW = store.getState().project.canvas.width;
    let rendererH = store.getState().project.canvas.height;

    const paint = (t: number): void => {
      const p: Project = store.getState().project;
      // Rebuild the renderer if the canvas size changed (new stage size).
      if (p.canvas.width !== rendererW || p.canvas.height !== rendererH) {
        renderer = makePreviewRenderer(p);
        rendererW = p.canvas.width;
        rendererH = p.canvas.height;
      }
      drawPreviewFrame(renderer, ctx, p, t);
    };

    const clock = new PlaybackClock({
      onTick: (t) => {
        store.setUi({ playhead: t });
        paint(t);
      },
      getDuration: () => store.getState().project.canvas.durationSeconds,
      getLoop: () => store.getState().ui.loop,
    });
    // Expose for the transport + tests; paint the initial frame.
    (canvas as unknown as { __clock: PlaybackClock }).__clock = clock;
    paint(store.getState().ui.playhead);

    return () => clock.dispose();
    // Re-init when the canvas backing size changes (new project dimensions).
  }, [store, width, height]);

  return (
    <div className="preview-stage" data-transparent={project.background === "transparent"}>
      <canvas ref={canvasRef} width={width} height={height} className="preview-canvas" aria-label="Preview" />
    </div>
  );
}

/** Reads the clock a PreviewCanvas attached to its canvas (for the transport). */
export function getClock(canvas: HTMLCanvasElement | null): PlaybackClock | null {
  return canvas ? ((canvas as unknown as { __clock?: PlaybackClock }).__clock ?? null) : null;
}
