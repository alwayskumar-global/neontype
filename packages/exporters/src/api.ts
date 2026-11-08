/**
 * Public export entry points (Req 9, Req 10, Req 2.6-2.10).
 *
 * Each entry dispatches the export through `dispatchExport`, which runs on a
 * Worker when `Worker` + `OffscreenCanvas` are available and falls back to the
 * main thread otherwise (byte-identical). The caller's `onProgress` and
 * `AbortSignal` stay on the calling thread and are bridged by the dispatcher.
 *
 * Audio is DECODED ON THE MAIN THREAD here (`OfflineAudioContext` is
 * window-only): the raw bytes are size-capped, decoded, decoded-size-capped,
 * and trim/padded to the project duration, then only the finished PCM is handed
 * to the worker (transferred, not copied). AAC capability is checked here,
 * before dispatch, so an unsupported build returns `browser-unsupported` and
 * never a silent drop. Every entry returns an `ExportResult` and never throws.
 */

import { ProjectSchema, type Project } from "@studio/engine";

import type { ExportResult, Mp4Options, PngSequenceOptions, GifOptions } from "./types.js";
import { fail } from "./errors.js";
import { dispatchExport } from "./worker/dispatch.js";
import type { WorkerOptions, WorkerPcm } from "./worker/protocol.js";
import { DEFAULT_LIMITS } from "./types.js";
import { decodeAudio } from "./audio/decode.js";
import { trimOrPad, silentTrack } from "./audio/trim-pad.js";

/**
 * Compile-time exhaustive mapping of every `Mp4Options` field to how it reaches
 * the export. A field is either forwarded into `WorkerOptions` ("worker"),
 * decoded on the main thread into `audioPcm` ("decoded-on-main"), or consumed by
 * the dispatcher on the calling thread ("main-thread"). The `Record` is keyed by
 * `keyof Mp4Options`, so adding an option without classifying it fails to
 * compile — guaranteeing no option is silently dropped.
 */
export const MP4_OPTION_DISPOSITION: Record<keyof Mp4Options, "worker" | "decoded-on-main" | "main-thread"> = {
  output: "worker",
  videoBitrate: "worker",
  backgroundFallback: "worker",
  addSilentTrack: "worker",
  audio: "decoded-on-main",
  limits: "main-thread",
  signal: "main-thread",
  onProgress: "main-thread",
};

/** Safe AAC support probe on the main thread; false on any throw/unknown. */
async function aacSupported(): Promise<boolean> {
  try {
    if (typeof AudioEncoder === "undefined") return false;
    const r = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    return r.supported === true;
  } catch {
    return false;
  }
}

/** Exports an MP4 (H.264 + optional AAC). Never throws. */
export async function exportMp4(project: Project, options: Mp4Options = {}): Promise<ExportResult> {
  // Touch the disposition map so it is retained and type-checked.
  void MP4_OPTION_DISPOSITION;

  const wantsAudio = options.audio !== undefined || options.addSilentTrack === true;

  let audioPcm: WorkerPcm | undefined;
  if (wantsAudio) {
    // AAC capability is checked on the main thread BEFORE dispatch (Req 3.6/3.7).
    if (!(await aacSupported())) {
      return fail("browser-unsupported", "Audio was requested but AAC encoding is unsupported.");
    }

    // The project duration drives trim/pad; read it from the validated project.
    const parsed = ProjectSchema.safeParse(project);
    if (!parsed.success) {
      return fail("project-invalid", "Project failed schema validation.", ["project"]);
    }
    const durationSeconds = parsed.data.canvas.durationSeconds;

    if (options.audio) {
      // decodeAudio enforces the 50 MB file cap and the decoded-size caps, and
      // returns a typed audio-decode-failed on any failure (never throws).
      const decoded = await decodeAudio(options.audio.bytes);
      if (!decoded.ok) return { ok: false, error: decoded.error };
      const track = trimOrPad(decoded.audio, durationSeconds);
      audioPcm = { channels: track.channels, sampleRate: track.sampleRate, length: track.length };
    } else {
      // Silent track needs no decode (silence synthesised directly).
      const track = silentTrack(durationSeconds, 48_000, 2);
      audioPcm = { channels: track.channels, sampleRate: track.sampleRate, length: track.length };
    }
  }

  const workerOptions: WorkerOptions = {
    output: options.output,
    videoBitrate: options.videoBitrate,
    backgroundFallback: options.backgroundFallback,
    addSilentTrack: options.addSilentTrack,
    audioPcm,
  };

  return dispatchExport({
    driverId: "mp4",
    format: "mp4",
    project,
    options: workerOptions,
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Exports a PNG sequence as a ZIP of stored entries. Never throws. */
export function exportPngSequence(
  project: Project,
  options: PngSequenceOptions = {},
): Promise<ExportResult> {
  return dispatchExport({
    driverId: "png-sequence",
    format: "png-sequence",
    project,
    options: { output: options.output },
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Exports an animated GIF. Never throws. */
export function exportGif(project: Project, options: GifOptions = {}): Promise<ExportResult> {
  return dispatchExport({
    driverId: "gif",
    format: "gif",
    project,
    options: { output: options.output },
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    onProgress: options.onProgress,
    signal: options.signal,
  });
}
