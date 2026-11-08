/**
 * Public types for `@studio/exporters` (Req 10.1, 10.7, 9.9, 2.2).
 *
 * The public surface is deliberately small and stable: one option type per
 * format, a discriminated-union `ExportResult`, a `CapabilityReport`, and the
 * caller-configurable `ExportLimits`. `ErrorCode`, `ExportNote`, and
 * `ExportError` live in `./errors.ts` and are re-exported from the barrel.
 */

import type { ErrorCode, ExportError, ExportNote } from "./errors.js";

/** The export formats this package produces. */
export type ExportFormat = "mp4" | "png-sequence" | "webm-alpha" | "gif" | "webp";

/** Progress reported once per encoded frame (Req 9.1). */
export interface ExportProgress {
  /** Fraction complete in `[0, 1]`. */
  fraction: number;
  /** Current frame index in `[0, frameCount - 1]`. */
  frame: number;
  /** Total frame count (positive integer). */
  frameCount: number;
}

/** The summary carried on a successful export (Req 10.7). */
export interface ExportSummary {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  byteSize: number;
  notes: ExportNote[];
}

/**
 * The discriminated-union result of every export (Req 10.1). Discriminated on
 * `ok`; never thrown.
 */
export type ExportResult =
  | {
      ok: true;
      format: ExportFormat;
      file: Blob;
      fileName: string;
      summary: ExportSummary;
    }
  | { ok: false; error: ExportError };

/** Caller-configurable resource limits; defaults in `DEFAULT_LIMITS` (Req 9.9). */
export interface ExportLimits {
  maxFrames: number;
  maxPixels: number;
  maxDurationSeconds: number;
  maxEncodeQueueSize: number;
  memoryBudgetBytes: number;
}

/** The default limits (Req 9 defaults). */
export const DEFAULT_LIMITS: ExportLimits = {
  maxFrames: 18000,
  maxPixels: 8294400, // 3840 * 2160
  maxDurationSeconds: 600,
  maxEncodeQueueSize: 8,
  memoryBudgetBytes: 1.5 * 1024 * 1024 * 1024,
};

/** Untrusted imported audio bytes (Req 11). */
export type AudioInput = { bytes: Uint8Array };

/** Options common to every format. */
export interface BaseExportOptions {
  /** Output size; defaults to the project canvas size (Req 14). */
  output?: { width: number; height: number };
  /** Resource-limit overrides; unset fields fall back to `DEFAULT_LIMITS`. */
  limits?: Partial<ExportLimits>;
  /** Cancellation signal (Req 9.3). */
  signal?: AbortSignal;
  /** Progress callback invoked once per encoded frame (Req 9.1). */
  onProgress?: (p: ExportProgress) => void;
}

/** MP4 (H.264 + optional AAC) options (Req 2). */
export interface Mp4Options extends BaseExportOptions {
  videoBitrate?: number;
  /** Solid background for a transparent project; `#rrggbb`, default `#000000`. */
  backgroundFallback?: string;
  audio?: AudioInput;
  addSilentTrack?: boolean;
}

/** PNG sequence (ZIP) options (Req 4). */
export type PngSequenceOptions = BaseExportOptions;

/** WebM-with-alpha (VP9) options (Req 5). */
export interface WebmAlphaOptions extends BaseExportOptions {
  videoBitrate?: number;
}

/** Animated GIF options (Req 6). */
export type GifOptions = BaseExportOptions;

/** Animated WebP options (Req 7). */
export interface WebpOptions extends BaseExportOptions {
  /** Still-frame WebP quality in `[0, 1]`. */
  quality?: number;
}

/** A per-codec/format capability result (Req 3). */
export type CapabilityResult = {
  status: "supported" | "unsupported" | "unknown";
  reason?: string;
};

/** The aggregate capability report used by the UI (Req 3). */
export interface CapabilityReport {
  mp4: CapabilityResult;
  webmAlpha: CapabilityResult;
  gif: CapabilityResult;
  webp: CapabilityResult;
  aac: CapabilityResult;
  pngSequence: CapabilityResult;
  embed: CapabilityResult;
}

export type { ErrorCode, ExportError, ExportNote };

// Re-export the engine Project type for internal modules (worker protocol).
export type { Project } from "@studio/engine";
