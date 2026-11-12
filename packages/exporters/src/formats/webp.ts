/**
 * Animated WebP exporter (Req 7, Req 12).
 *
 * Renders `round(fps * durationSeconds)` frames through the shared `FrameRenderer` (so blur and scaling match
 * every other path), encodes each as a still WebP with the browser's `convertToBlob('image/webp', quality)`,
 * and wraps the stills' VP8/VP8L (+ALPH) chunks in a hand-written animated-WebP RIFF container (`webp/riff.ts`).
 * No WebP encoder package. A transparent project keeps each frame's alpha and sets the VP8X alpha flag; an opaque
 * hex background yields an opaque animation (ALPH chunks dropped, flag clear). Frame durations are whole
 * milliseconds derived from the frame count with the rounding remainder spread so they sum to exactly
 * `durationSeconds * 1000`.
 *
 * Never calls the engine's `renderFrame` directly (Req 8/14 via FrameRenderer). Independent of other formats (7.6).
 */
import { ProjectSchema, type Project } from "@studio/engine";
import type { ExportResult, WebpOptions, ExportLimits } from "../types.js";
import { fail } from "../errors.js";
import { DEFAULT_LIMITS } from "../types.js";
import { frameCountFor, validateFrameRange } from "../frame-stepper.js";
import { validateLimits } from "../validate.js";
import { resolveScalePlan, isScalePlan, type ScalePlan } from "../scale.js";
import { FrameRenderer } from "../render-frame.js";
import { probeStillWebpType } from "../webp/probe.js";
import { buildAnimatedWebp, frameDurationsMs, parseStillWebp, WebpFormatError, type AnimFrame } from "../webp/riff.js";
/** Still-frame quality used when `options.quality` is absent (Chrome's own default for image/webp). */
export const WEBP_DEFAULT_QUALITY = 0.8;
/** Whether `quality` is acceptable: a finite number in [0, 1]. */
export function isValidWebpQuality(quality: number): boolean {
  return Number.isFinite(quality) && quality >= 0 && quality <= 1;
}
/** Produces the still-WebP bytes of one frame. */
export interface FrameSource {
  encode(index: number): Promise<Uint8Array>;
}
/** Seams for tests: whether a still WebP can be encoded here, and where the stills come from. */
export interface WebpDeps {
  stillWebpSupported?: () => Promise<boolean>;
  makeFrameSource?: (project: Project, plan: ScalePlan, quality: number) => FrameSource;
}
/** The default probe: a tiny still encode must yield an `image/webp` blob (same test as the capability probe). */
async function probeStillWebp(): Promise<boolean> {
  return (await probeStillWebpType()) === "image/webp";
}
/** The default source: FrameRenderer into an OffscreenCanvas, then `convertToBlob`. */
function canvasFrameSource(project: Project, plan: ScalePlan, quality: number): FrameSource {
  const renderer = new FrameRenderer(plan);
  const out = new OffscreenCanvas(plan.outputWidth, plan.outputHeight);
  const ctx = out.getContext("2d")!;
  const fps = project.canvas.fps;
  return {
    async encode(index) {
      renderer.render(project, index / fps, ctx);
      const blob = await out.convertToBlob({ type: "image/webp", quality });
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}
/** `#rrggbb` to [r, g, b, 255]. */
function hexToRgba(hex: string): [number, number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}
/**
 * Exports an animated WebP. `project` is validated with the engine schema; the caller's `onProgress` and abort
 * check come from the host. Returns `browser-unsupported` BEFORE encoding any frame when a still WebP cannot be
 * encoded, and never leaves a partial file. Never throws.
 */
export async function runWebpExport(
  project: Project,
  options: WebpOptions,
  onProgress: (fraction: number, frame: number, frameCount: number) => void,
  isAborted: () => boolean,
  deps: WebpDeps = {},
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
  const quality = options.quality ?? WEBP_DEFAULT_QUALITY;
  if (!isValidWebpQuality(quality)) {
    return fail("invalid-options", "WebP quality must be a number between 0 and 1.", ["quality"]);
  }
  const planOrError = resolveScalePlan(proj.canvas, options.output);
  if (!isScalePlan(planOrError)) return planOrError;
  const plan = planOrError;
  const width = plan.outputWidth;
  const height = plan.outputHeight;
  const limits: ExportLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const limitError = validateLimits({ durationSeconds, frameCount, width, height }, limits);
  if (limitError) return limitError;
  if (!(await (deps.stillWebpSupported ?? probeStillWebp)())) {
    return fail("browser-unsupported", "Animated WebP export needs the browser to encode still WebP images, and this one cannot.");
  }
  const transparent = proj.background === "transparent";
  const durations = frameDurationsMs(frameCount, Math.round(durationSeconds * 1000));
  let source: FrameSource;
  try {
    source = (deps.makeFrameSource ?? canvasFrameSource)(proj, plan, quality);
  } catch {
    return fail("browser-unsupported", "Animated WebP export requires OffscreenCanvas.");
  }
  const frames: AnimFrame[] = [];
  try {
    for (let index = 0; index < frameCount; index++) {
      if (isAborted()) return fail("cancelled", "Export was cancelled.");
      const still = parseStillWebp(await source.encode(index));
      if (still.width !== width || still.height !== height) {
        throw new WebpFormatError(`frame ${index} is ${still.width}x${still.height}, expected ${width}x${height}`);
      }
      // A transparent project keeps the still's ALPH chunk; an opaque one drops it (its alpha is all 255).
      const alph = transparent ? still.alph : null;
      const data = new Uint8Array((alph?.byteLength ?? 0) + still.image.byteLength);
      if (alph) data.set(alph, 0);
      data.set(still.image, alph?.byteLength ?? 0);
      frames.push({ data, width, height, durationMs: durations[index]! });
      onProgress((index + 1) / frameCount, index, frameCount);
    }
  } catch {
    return fail("encoder-failure", "A frame failed to encode; no WebP was produced.");
  }
  let bytes: Uint8Array;
  try {
    bytes = buildAnimatedWebp(frames, {
      width,
      height,
      alpha: transparent,
      background: transparent ? [0, 0, 0, 0] : hexToRgba(proj.background),
      loopCount: 0,
    });
  } catch {
    return fail("encoder-failure", "The WebP container could not be assembled; no WebP was produced.");
  }
  const file = new Blob([bytes.slice().buffer], { type: "image/webp" });
  return {
    ok: true,
    format: "webp",
    file,
    fileName: "export.webp",
    summary: { width, height, fps, frameCount, byteSize: bytes.byteLength, notes: [] },
  };
}
