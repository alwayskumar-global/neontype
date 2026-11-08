/**
 * A self-contained looping canvas preview of a Project (landing page). Renders
 * through the same FrameRenderer path as the studio preview, with its own
 * FrameRenderer + metrics provider. Autoplays and loops, pauses when off-screen
 * (IntersectionObserver), and under prefers-reduced-motion shows a single static
 * visible frame instead of animating. No heavy blur is used by callers.
 */
import { useEffect, useRef } from "react";
import type { Project } from "@studio/engine";
import { makePreviewRenderer, drawPreviewFrame } from "../preview/draw.js";

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LoopingPreview({
  project,
  staticTime = 1.2,
  className,
  label,
}: {
  project: Project;
  staticTime?: number;
  className?: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const renderer = makePreviewRenderer(project);
    const duration = project.canvas.durationSeconds;

    // Reduced motion: paint one visible frame and stop.
    if (prefersReducedMotion()) {
      drawPreviewFrame(renderer, ctx, project, Math.min(staticTime, duration));
      return;
    }

    let raf = 0;
    let start = 0;
    let visible = true;
    const loop = (t: number): void => {
      if (start === 0) start = t;
      const tc = ((t - start) / 1000) % duration;
      drawPreviewFrame(renderer, ctx, project, tc);
      raf = requestAnimationFrame(loop);
    };
    const play = (): void => {
      if (!raf) {
        start = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = (): void => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Pause when off-screen.
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) play();
      else stop();
    });
    io.observe(canvas);
    play();

    return () => {
      io.disconnect();
      stop();
    };
  }, [project, staticTime]);

  return (
    <canvas
      ref={canvasRef}
      width={project.canvas.width}
      height={project.canvas.height}
      className={className}
      aria-label={label}
    />
  );
}
