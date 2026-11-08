/**
 * Export driver seam (Req 9).
 *
 * A `DriverArgs` describes an export; a driver builds an `ExportEncoder` for the
 * requested format and runs the shared `runExport` loop. The SAME driver runs on
 * the worker and on the main thread, so output is byte-identical (Req 9.7, 9.8).
 *
 * Group 3 ships a `recording` driver used by the worker-bridge visual test: it
 * renders each frame into an `OffscreenCanvas` via the engine and records the
 * raw RGBA bytes, with no real codec. Format drivers (MP4, PNG sequence, …) are
 * registered by later groups via `registerDriver`. The worker entry and the
 * main-thread fallback both resolve a driver by id through `resolveDriver`, so
 * neither path hard-codes a format.
 */

import type { Project } from "@studio/engine";

import type { ExportResult, ExportProgress, ExportFormat, ExportLimits } from "../types.js";
import { fail } from "../errors.js";
import { frameCountFor, validateFrameRange } from "../frame-stepper.js";
import { resolveScalePlan, isScalePlan } from "../scale.js";
import { FrameRenderer, type ExportContext2D } from "../render-frame.js";
import { runExport, type ExportEncoder } from "./host.js";
import { frameCountYield } from "./yield.js";
import type { WorkerOptions } from "./protocol.js";
import { runMp4Export } from "../formats/mp4.js";
import { runPngSequenceExport } from "../formats/png-seq.js";
import { runGifExport } from "../formats/gif.js";

/** Everything a driver needs to run an export (cloneable; worker-safe). */
export interface DriverArgs {
  format: ExportFormat;
  project: Project;
  options: WorkerOptions;
  limits: ExportLimits;
}

/** A driver: builds the encoder and runs the loop, returning an ExportResult. */
export type ExportDriver = (
  args: DriverArgs,
  onProgress: (p: ExportProgress) => void,
  isAborted: () => boolean,
) => Promise<ExportResult>;

/**
 * Creates an output-sized `OffscreenCanvas` 2D context, or `null` when the
 * runtime has no `OffscreenCanvas` (the worker path is only taken when it
 * exists; the main-thread fallback also has `OffscreenCanvas` in supported
 * browsers).
 */
function offscreenContext(width: number, height: number): ExportContext2D | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  return canvas.getContext("2d");
}

/**
 * The recording driver: renders every frame with the engine into an
 * `OffscreenCanvas` and records its RGBA bytes. No codec, no DOM. Deterministic.
 * The produced "file" is the concatenation of per-frame RGBA buffers so the
 * worker/main parity test can compare raw frame bytes (Req 9.7).
 */
export const recordingDriver: ExportDriver = async (args, onProgress, isAborted) => {
  const { project, options, limits } = args;
  const { fps, durationSeconds } = project.canvas;

  const rangeError = validateFrameRange(durationSeconds, fps);
  if (rangeError) return rangeError;
  const frameCount = frameCountFor(durationSeconds, fps);

  const planOrError = resolveScalePlan(project.canvas, options.output);
  if (!isScalePlan(planOrError)) return planOrError;
  const plan = planOrError;
  const { outputWidth: width, outputHeight: height } = plan;

  const ctx = offscreenContext(width, height);
  if (!ctx) {
    return fail("browser-unsupported", "OffscreenCanvas is not available in this runtime.");
  }

  // Blur and scaling go through the ONE shared frame renderer (Req 8, Req 14).
  const renderer = new FrameRenderer(plan);

  const frames: Uint8Array[] = [];
  let held = 0;

  const encoder: ExportEncoder = {
    get encodeQueueSize() {
      return 0;
    },
    get bytesHeld() {
      return held;
    },
    encode(index: number) {
      const t = index / fps;
      renderer.render(project, t, ctx);
      const img = ctx.getImageData(0, 0, width, height);
      const bytes = new Uint8Array(img.data.buffer.slice(0));
      frames.push(bytes);
      held += bytes.byteLength;
    },
    drainBelow() {
      return Promise.resolve();
    },
    finalize() {
      let total = 0;
      for (const f of frames) total += f.byteLength;
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const f of frames) {
        merged.set(f, offset);
        offset += f.byteLength;
      }
      const file = new Blob([merged], { type: "application/octet-stream" });
      return Promise.resolve({ file, fileName: "frames.bin", byteSize: total });
    },
    release() {
      frames.length = 0;
      held = 0;
    },
  };

  // In a worker (no `document`) yield to a macrotask every few frames so a
  // posted `abort` message is delivered; on the main thread it is unnecessary.
  const inWorker = typeof document === "undefined";
  const yieldControl = inWorker ? frameCountYield() : undefined;

  return runExport({
    format: args.format,
    frameCount,
    width,
    height,
    fps,
    limits,
    encoder,
    isAborted,
    onProgress,
    yieldControl,
  });
};

/**
 * The MP4 driver: adapts `exportMp4` to the `ExportDriver` shape. The
 * `WorkerOptions` carry the MP4-specific fields (videoBitrate,
 * backgroundFallback, addSilentTrack); `output` becomes the Mp4Options output.
 */
export const mp4Driver: ExportDriver = (args, onProgress, isAborted) => {
  const o = args.options;
  // The PCM was decoded + trim/padded on the main thread and TRANSFERRED here.
  const audio = o.audioPcm
    ? { channels: o.audioPcm.channels, sampleRate: o.audioPcm.sampleRate, length: o.audioPcm.length }
    : null;
  return runMp4Export(
    args.project,
    {
      output: o.output,
      videoBitrate: o.videoBitrate,
      backgroundFallback: o.backgroundFallback,
      addSilentTrack: o.addSilentTrack,
      limits: args.limits,
    },
    (fraction, frame, frameCount) => onProgress({ fraction, frame, frameCount }),
    isAborted,
    audio,
  );
};

/** The PNG-sequence driver: adapts `runPngSequenceExport` to the driver shape. */
export const pngSequenceDriver: ExportDriver = (args, onProgress, isAborted) =>
  runPngSequenceExport(
    args.project,
    { output: args.options.output, limits: args.limits },
    (fraction, frame, frameCount) => onProgress({ fraction, frame, frameCount }),
    isAborted,
  );

/** The GIF driver: adapts `runGifExport` to the driver shape. */
export const gifDriver: ExportDriver = (args, onProgress, isAborted) =>
  runGifExport(
    args.project,
    { output: args.options.output, limits: args.limits },
    (fraction, frame, frameCount) => onProgress({ fraction, frame, frameCount }),
    isAborted,
  );

/** The driver registry, keyed by a driver id. */
const registry = new Map<string, ExportDriver>([
  ["recording", recordingDriver],
  ["mp4", mp4Driver],
  ["png-sequence", pngSequenceDriver],
  ["gif", gifDriver],
]);

/** Registers a driver under `id` (later groups register format drivers). */
export function registerDriver(id: string, driver: ExportDriver): void {
  registry.set(id, driver);
}

/** Resolves a driver by id, or `undefined` when none is registered. */
export function resolveDriver(id: string): ExportDriver | undefined {
  return registry.get(id);
}
