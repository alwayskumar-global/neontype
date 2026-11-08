/**
 * Worker message protocol (Req 9.8).
 *
 * `onProgress` callbacks and `AbortSignal` are not structured-cloneable, so
 * they stay on the main thread; `host.ts` bridges them to/from these messages.
 * The produced `Blob`/`ArrayBuffer` is transferred (zero-copy) in `result`.
 */

import type { ExportFormat, ExportResult, Project, ExportLimits } from "../types.js";

/**
 * Decoded PCM handed to the worker for muxing (Req 2.6-2.10). The audio is
 * decoded + trim/padded on the MAIN thread (OfflineAudioContext is window-only);
 * only finished PCM crosses the boundary. The channel buffers are TRANSFERRED
 * (zero-copy), so the main thread must not reuse them after dispatch.
 */
export interface WorkerPcm {
  /** Per-channel Float32 samples (transferred). */
  channels: Float32Array[];
  sampleRate: number;
  /** Frames per channel. */
  length: number;
}

/** Options posted to the worker: no callbacks, no signal (not cloneable). */
export interface WorkerOptions {
  output?: { width: number; height: number };
  videoBitrate?: number;
  backgroundFallback?: string;
  quality?: number;
  addSilentTrack?: boolean;
  /** Pre-decoded audio PCM for the AAC track; absent when there is no audio. */
  audioPcm?: WorkerPcm;
}

/** Main thread → worker. */
export type MainToWorker =
  | {
      type: "start";
      /** Which registered driver builds the encoder for this export. */
      driverId: string;
      format: ExportFormat;
      project: Project;
      options: WorkerOptions;
      limits: ExportLimits;
    }
  | { type: "abort" };

/** Worker → main thread. */
export type WorkerToMain =
  | { type: "progress"; fraction: number; frame: number; frameCount: number }
  | { type: "result"; result: ExportResult }
  | { type: "error"; code: string; message: string };
