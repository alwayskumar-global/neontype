/**
 * One-time perf probe (Requirement 13 measurement). DEV-only. Renders a
 * 1280x720, 5-layer project through the preview FrameRenderer at the project fps
 * for a fixed window and reports the frame-interval mean + p95 via FrameTimer.
 * Reports numbers only; it tunes nothing.
 */
import type { Project } from "@studio/engine";
import { demoProject } from "../model/demo.js";
import { makePreviewRenderer, drawPreviewFrame } from "./draw.js";
import { FrameTimer } from "../playback/perf.js";

function perfProject(withBlur: boolean): Project {
  const layers = Array.from({ length: 5 }, (_, i) => ({
    id: `l${i}`,
    text: `Layer ${i}`,
    tracks: [],
    effectInstances: withBlur
      ? [{ effectId: "blur-in", granularity: "character" as const, params: { startDelay: 0, durationSeconds: 0.6, startBlur: 12, delayPerGroup: 0.05, easing: "easeOut" } }]
      : [{ effectId: "fade-slide", granularity: "character" as const, params: { durationSeconds: 0.5, slideDistance: 24, slideAxis: "y", delayPerSegment: 0.05, easing: "easeOut" } }],
    fontFamily: "Noto Sans", fontSize: 64, fontWeight: "700", fill: "#ffcc00",
    align: "left" as const, letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
    startSeconds: 0, endSeconds: 5, anchor: { x: 80, y: 120 + i * 110 },
  }));
  return { schemaVersion: 1, canvas: { width: 1280, height: 720, fps: 30, durationSeconds: 5 }, background: "#101018", seed: 9, layers };
}

/** Plays `withBlur` project for `seconds`, returns { mean, p95, count }. */
export async function runPerfProbe(withBlur: boolean, seconds = 5): Promise<{ mean: number; p95: number; count: number }> {
  const project = perfProject(withBlur);
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const renderer = makePreviewRenderer(project);
  const fps = project.canvas.fps;
  const timer = new FrameTimer();

  let raf = 0;
  const loop = (t: number): void => {
    const tc = (t / 1000) % project.canvas.durationSeconds;
    drawPreviewFrame(renderer, ctx, project, tc);
    raf = requestAnimationFrame(loop);
    void fps;
  };
  timer.start();
  raf = requestAnimationFrame(loop);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  cancelAnimationFrame(raf);
  return timer.stop();
}

/** Plays an arbitrary project for `seconds`; returns frame-interval stats. */
export async function measureProject(project: Project, seconds = 5): Promise<{ mean: number; p95: number; count: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = project.canvas.width; canvas.height = project.canvas.height;
  const ctx = canvas.getContext("2d")!;
  const renderer = makePreviewRenderer(project);
  const timer = new FrameTimer();
  let raf = 0;
  const loop = (t: number): void => {
    const tc = (t / 1000) % project.canvas.durationSeconds;
    drawPreviewFrame(renderer, ctx, project, tc);
    raf = requestAnimationFrame(loop);
  };
  timer.start();
  raf = requestAnimationFrame(loop);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  cancelAnimationFrame(raf);
  return timer.stop();
}

/** Measures the built-in demo project (DEV probe). */
export function measureDemo(seconds = 5): Promise<{ mean: number; p95: number; count: number }> {
  return measureProject(demoProject(), seconds);
}
