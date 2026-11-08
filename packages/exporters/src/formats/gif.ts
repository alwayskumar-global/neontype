/**
 * Animated GIF exporter (Req 6, Req 12).
 *
 * Renders `round(fps * durationSeconds)` frames through the shared
 * `FrameRenderer` (so blur + scaling match every other path), quantizes each to
 * a palette of at most 256 colors via `gifenc`, and writes a single animated
 * GIF. Each frame's delay is `round(100 / fps)` CENTISECONDS (gifenc writes
 * `round(delay / 10)` cs, so we pass `round(100/fps) * 10` ms). A transparent
 * project uses GIF single-color transparency; an opaque hex background yields an
 * opaque GIF. GIF capability is always `supported`, but the guard is wired.
 *
 * Never calls the engine's `renderFrame` directly (Req 8/14 via FrameRenderer).
 */

import { ProjectSchema, type Project } from "@studio/engine";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

import type { ExportResult, GifOptions, ExportLimits } from "../types.js";
import { fail } from "../errors.js";
import { DEFAULT_LIMITS } from "../types.js";
import { frameCountFor, validateFrameRange } from "../frame-stepper.js";
import { validateLimits } from "../validate.js";
import { resolveScalePlan, isScalePlan } from "../scale.js";
import { FrameRenderer } from "../render-frame.js";

/** The GIF max palette size. */
export const GIF_MAX_COLORS = 256;

/** The per-frame delay in centiseconds for a frame rate (Req 6.2). */
export function gifDelayCentiseconds(fps: number): number {
  return Math.round(100 / fps);
}

/**
 * Exports an animated GIF. `project` is validated with the engine schema; the
 * caller's `onProgress`/`signal` are provided by the host. Never throws.
 */
export async function runGifExport(
  project: Project,
  options: GifOptions,
  onProgress: (fraction: number, frame: number, frameCount: number) => void,
  isAborted: () => boolean,
): Promise<ExportResult> {
  const parsed = ProjectSchema.safeParse(project);
  if (!parsed.success) {
    return fail("project-invalid", "Project failed schema validation.", ["project"]);
  }
  const proj = parsed.data;

  const { fps, durationSeconds } = proj.canvas;
  const rangeError = validateFrameRange(durationSeconds, fps);
  if (rangeError) return rangeError;
  const frameCount = frameCountFor(durationSeconds, fps);

  const planOrError = resolveScalePlan(proj.canvas, options.output);
  if (!isScalePlan(planOrError)) return planOrError;
  const plan = planOrError;
  const width = plan.outputWidth;
  const height = plan.outputHeight;

  const limits: ExportLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const limitError = validateLimits({ durationSeconds, frameCount, width, height }, limits);
  if (limitError) return limitError;

  if (typeof OffscreenCanvas === "undefined") {
    return fail("browser-unsupported", "GIF export requires OffscreenCanvas.");
  }

  const transparentProject = proj.background === "transparent";
  // gifenc delay is milliseconds; it writes round(delay/10) cs, so pass the
  // target centiseconds * 10 to land exactly on round(100/fps) cs.
  const delayMs = gifDelayCentiseconds(fps) * 10;

  const renderer = new FrameRenderer(plan);
  const out = new OffscreenCanvas(width, height);
  const outCtx = out.getContext("2d")!;

  const gif = GIFEncoder();

  try {
    for (let index = 0; index < frameCount; index++) {
      if (isAborted()) return fail("cancelled", "Export was cancelled.");
      renderer.render(proj, index / fps, outCtx);
      const rgba = outCtx.getImageData(0, 0, width, height).data;

      // Quantize to <= 256 colors. For a transparent project, keep a 1-bit
      // alpha so transparent pixels collapse to the single transparent index.
      const format = transparentProject ? "rgba4444" : "rgb565";
      const palette = quantize(rgba, GIF_MAX_COLORS, {
        format,
        oneBitAlpha: transparentProject,
      });
      const indexed = applyPalette(rgba, palette, format);

      // When transparent, the palette's last entry is the transparent color
      // gifenc assigns; use index 0 as the transparent index (gifenc maps fully
      // transparent pixels there under oneBitAlpha).
      gif.writeFrame(indexed, width, height, {
        palette,
        delay: delayMs,
        repeat: 0,
        transparent: transparentProject,
        transparentIndex: transparentProject ? 0 : undefined,
      });
      onProgress((index + 1) / frameCount, index, frameCount);
    }
  } catch {
    return fail("encoder-failure", "A frame failed to encode; no GIF was produced.");
  }

  gif.finish();
  const bytes = gif.bytesView();
  const ab = bytes.slice().buffer;
  const file = new Blob([ab], { type: "image/gif" });
  return {
    ok: true,
    format: "gif",
    file,
    fileName: "export.gif",
    summary: { width, height, fps, frameCount, byteSize: bytes.byteLength, notes: [] },
  };
}
