/**
 * MP4 (H.264 + optional AAC) exporter (Req 2, Req 12).
 *
 * Validates the `Project` (engine `ProjectSchema`) and options before frame 0,
 * then encodes frames to H.264 via `VideoEncoder` into the `mp4-muxer` adapter.
 * MP4 carries no alpha, so a transparent project is flattened over the solid
 * `backgroundFallback` and the `mp4-no-transparency` note is attached. H.264
 * requires even dimensions, so odd output dimensions are rounded up to even and
 * reported in the summary. Returns an `ExportResult` on every path; never throws
 * (any encoder throw is mapped to `encoder-failure` by the shared loop).
 *
 * Rendering and scaling go exclusively through `FrameRenderer` (Req 8, Req 14);
 * this module never calls the engine's `renderFrame` directly.
 */

import { ProjectSchema, type Project } from "@studio/engine";

import type { ExportResult, Mp4Options, ExportLimits } from "../types.js";
import type { ExportNote } from "../errors.js";
import { fail } from "../errors.js";
import { DEFAULT_LIMITS } from "../types.js";
import { frameCountFor, validateFrameRange } from "../frame-stepper.js";
import {
  applyEvenDimensionRule,
  validateBackgroundFallback,
  validateLimits,
  isHexColor,
} from "../validate.js";
import { resolveScalePlan, isScalePlan } from "../scale.js";
import { FrameRenderer } from "../render-frame.js";
import { runExport, type ExportEncoder } from "../worker/host.js";
import { frameCountYield } from "../worker/yield.js";
import { createMp4Muxer, type Mp4MuxerHandle } from "../muxers/mp4.js";
import { parseMp4 } from "../__tests__/helpers/mp4-box-reader.js";
import { AAC_FRAME_SAMPLES } from "../audio/trim-pad.js";
import type { DecodedAudio } from "../audio/decode.js";

const DEFAULT_FALLBACK = "#000000";


/** Builds the `VideoEncoder` config for H.264 at a size/bitrate. */
function h264Config(width: number, height: number, bitrate: number): VideoEncoderConfig {
  return {
    codec: "avc1.42001f", // H.264 Constrained Baseline, Level 3.1
    width,
    height,
    bitrate,
    framerate: undefined,
  } as VideoEncoderConfig;
}

/**
/** The validated MP4 output plan (pure; no encoder). */
export interface Mp4Plan {
  proj: Project;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationSeconds: number;
  notes: ExportNote[];
  fallback: string;
  scalePlan: {
    canvasWidth: number;
    canvasHeight: number;
    outputWidth: number;
    outputHeight: number;
    scale: number;
    needsScaling: boolean;
  };
}

/**
 * Validates the project + options and resolves the MP4 output plan (even
 * dimensions for H.264, the transparent -> fallback note). Pure: it touches no
 * encoder, so it is unit-testable in Node. Returns a failure `ExportResult` or
 * the `Mp4Plan`.
 */
export function planMp4Output(project: Project, options: Mp4Options): ExportResult | Mp4Plan {
  const parsed = ProjectSchema.safeParse(project);
  if (!parsed.success) {
    return fail("project-invalid", "Project failed schema validation.", ["project"]);
  }
  const proj = parsed.data;

  const fallback = options.backgroundFallback ?? DEFAULT_FALLBACK;
  const bgError = validateBackgroundFallback(options.backgroundFallback);
  if (bgError) return bgError;
  if (!isHexColor(fallback)) {
    return fail("invalid-options", "backgroundFallback must be #rrggbb", ["backgroundFallback"]);
  }

  const { fps, durationSeconds } = proj.canvas;
  const rangeError = validateFrameRange(durationSeconds, fps);
  if (rangeError) return rangeError;
  const frameCount = frameCountFor(durationSeconds, fps);

  const planOrError = resolveScalePlan(proj.canvas, options.output);
  if (!isScalePlan(planOrError)) return planOrError;
  const even = applyEvenDimensionRule(planOrError.outputWidth, planOrError.outputHeight);
  const scalePlan = {
    canvasWidth: proj.canvas.width,
    canvasHeight: proj.canvas.height,
    outputWidth: even.width,
    outputHeight: even.height,
    scale: even.width / proj.canvas.width,
    needsScaling: even.width !== proj.canvas.width || even.height !== proj.canvas.height,
  };

  const limits: ExportLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const limitError = validateLimits(
    { durationSeconds, frameCount, width: even.width, height: even.height },
    limits,
  );
  if (limitError) return limitError;

  const notes: ExportNote[] = proj.background === "transparent" ? ["mp4-no-transparency"] : [];

  return {
    proj,
    width: even.width,
    height: even.height,
    frameCount,
    fps,
    durationSeconds,
    notes,
    fallback,
    scalePlan,
  };
}

/** Narrows `planMp4Output`'s union to the success (`Mp4Plan`) case. */
export function isMp4Plan(value: ExportResult | Mp4Plan): value is Mp4Plan {
  return (value as Mp4Plan).scalePlan !== undefined;
}

/**
 * Exports an MP4. `project` is validated with the engine schema; `options` are
 * validated here. The caller's `onProgress`/`signal` are provided by the host.
 */
export async function runMp4Export(
  project: Project,
  options: Mp4Options,
  onProgress: (fraction: number, frame: number, frameCount: number) => void,
  isAborted: () => boolean,
  /**
   * Pre-decoded audio PCM for the AAC track, decoded + trim/padded on the MAIN
   * thread (OfflineAudioContext is window-only). `null` when there is no audio.
   * When audio was requested, the produced file MUST contain a `soun` track or
   * the export fails with `muxer-failure` (no silent drop).
   */
  audio: DecodedAudio | null = null,
): Promise<ExportResult> {
  const planned = planMp4Output(project, options);
  if (!isMp4Plan(planned)) return planned;
  const { proj, width, height, frameCount, fps, durationSeconds, notes, fallback } = planned;
  const plan = planned.scalePlan;
  const limits: ExportLimits = { ...DEFAULT_LIMITS, ...options.limits };

  if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
    return fail("browser-unsupported", "MP4 export requires WebCodecs VideoEncoder and OffscreenCanvas.");
  }

  // Audio was requested (an AAC track is expected) when PCM was supplied.
  const wantsAudio = audio !== null;
  if (wantsAudio && typeof AudioEncoder === "undefined") {
    return fail("browser-unsupported", "Audio requested but AAC (AudioEncoder) is unavailable.");
  }

  const renderer = new FrameRenderer(plan);
  const muxer: Mp4MuxerHandle = createMp4Muxer(
    { width, height, frameRate: fps },
    audio ? { numberOfChannels: audio.channels.length, sampleRate: audio.sampleRate } : undefined,
  );

  // Flatten surface: fallback fill + the rendered frame (drops alpha).
  const flat = new OffscreenCanvas(width, height);
  const flatCtx = flat.getContext("2d")!;
  const stageOut = new OffscreenCanvas(width, height);
  const stageOutCtx = stageOut.getContext("2d")!;

  let firstError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      firstError ??= e;
    },
  });
  encoder.configure(h264Config(width, height, options.videoBitrate ?? 8_000_000));

  // Optional AAC audio encoder; configured only when an audio track exists.
  // AAC frames whose presentation timestamp is at/after the project end are
  // DROPPED so encoder priming/tail frames do not extend the audio track past
  // the video (Req 2.7). The AudioSpecificConfig metadata arrives on the first
  // emitted chunk; it is cached and attached to the first MUXED chunk so a
  // dropped leading chunk could never strip it (in practice chunk 0 at t=0 is
  // always kept, but this is robust regardless).
  const audioEndUs = durationSeconds * 1_000_000;
  let audioMeta: EncodedAudioChunkMetadata | undefined;
  let firstAudioMuxed = false;
  let audioEncoder: AudioEncoder | null = null;
  if (audio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta) audioMeta = meta;
        if (chunk.timestamp >= audioEndUs) return; // drop priming/tail past the end
        const metaToUse = firstAudioMuxed ? undefined : (meta ?? audioMeta);
        firstAudioMuxed = true;
        muxer.addAudioChunk(chunk, metaToUse);
      },
      error: (e) => {
        firstError ??= e;
      },
    });
    // AAC encoder priming (~2048 samples of silence prepended by the encoder)
    // is NOT compensated: the muxer writes no edit list, so audio can start
    // ~46 ms late relative to video in players that do not apply the priming
    // offset. Dropping tail frames (above) bounds the END; the START offset is a
    // known AAC limitation documented in the package README.
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels.length,
      bitrate: 128_000,
    });
  }

  const frameDurationUs = Math.round(1_000_000 / fps);

  const exportEncoder: ExportEncoder = {
    get encodeQueueSize() {
      return encoder.encodeQueueSize;
    },
    get bytesHeld() {
      // Rough in-flight estimate: queued frames * one RGBA frame.
      return encoder.encodeQueueSize * width * height * 4;
    },
    encode(index: number) {
      if (firstError) throw firstError instanceof Error ? firstError : new Error("encoder error");
      renderer.render(proj, index / fps, stageOutCtx);
      // Flatten over the fallback so the MP4 frame is opaque.
      flatCtx.fillStyle = fallback;
      flatCtx.fillRect(0, 0, width, height);
      flatCtx.drawImage(stageOut, 0, 0);
      const timestamp = Math.round((index / fps) * 1_000_000);
      const frame = new VideoFrame(flat, { timestamp, duration: frameDurationUs });
      try {
        encoder.encode(frame, { keyFrame: index % Math.max(1, Math.round(fps * 2)) === 0 });
      } finally {
        frame.close();
      }
    },
    async drainBelow(max: number) {
      while (encoder.encodeQueueSize >= max) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    },
    async finalize() {
      if (audio && audioEncoder) {
        encodeAacTrack(audioEncoder, audio);
        await audioEncoder.flush();
        // Release the (transferred) PCM as soon as it is encoded (Req 9 memory).
        audio.channels.length = 0;
      }
      await encoder.flush();
      if (firstError) throw firstError instanceof Error ? firstError : new Error("encoder error");
      const bytes = muxer.finalize();
      // Copy into a fresh ArrayBuffer so the Blob part is strictly ArrayBuffer-backed.
      const ab = bytes.slice().buffer;
      const file = new Blob([ab], { type: "video/mp4" });
      return { file, fileName: "export.mp4", byteSize: bytes.byteLength };
    },
    release() {
      try {
        if (encoder.state !== "closed") encoder.close();
      } catch {
        // already closed; ignore
      }
      try {
        if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
      } catch {
        // already closed; ignore
      }
      if (audio) audio.channels.length = 0;
    },
  };

  const inWorker = typeof document === "undefined";
  const result = await runExport({
    format: "mp4",
    frameCount,
    width,
    height,
    fps,
    limits,
    encoder: exportEncoder,
    isAborted,
    onProgress: (p) => onProgress(p.fraction, p.frame, p.frameCount),
    notes,
    yieldControl: inWorker ? frameCountYield() : undefined,
  });

  // Zero silent drops: if audio was requested, the produced file MUST contain a
  // `soun` track. If not, surface muxer-failure instead of ok-without-audio.
  if (result.ok && wantsAudio) {
    const bytes = new Uint8Array(await result.file.arrayBuffer());
    const hasAudio = parseMp4(bytes).tracks.some((t) => t.handler === "soun");
    if (!hasAudio) {
      return fail("muxer-failure", "Audio was requested but no audio track was muxed.");
    }
  }
  return result;
}


/**
 * Encodes decoded PCM into AAC via the `AudioEncoder`, in 1024-sample frames
 * (interleaved per `AudioData`). Timestamps are derived from the frame index,
 * not a clock. The muxer receives the chunks via the encoder's output callback.
 */
function encodeAacTrack(audioEncoder: AudioEncoder, audio: DecodedAudio): void {
  const { channels, sampleRate, length } = audio;
  const numberOfChannels = channels.length;
  for (let offset = 0; offset < length; offset += AAC_FRAME_SAMPLES) {
    const frames = Math.min(AAC_FRAME_SAMPLES, length - offset);
    // Planar Float32 layout: all of channel 0, then channel 1, ...
    const planar = new Float32Array(frames * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      planar.set(channels[c].subarray(offset, offset + frames), c * frames);
    }
    const timestamp = Math.round((offset / sampleRate) * 1_000_000);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels,
      timestamp,
      data: planar,
    });
    try {
      audioEncoder.encode(data);
    } finally {
      data.close();
    }
  }
}
