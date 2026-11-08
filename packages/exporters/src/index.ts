/**
 * Public barrel for `@studio/exporters`.
 *
 * Exposes only the public surface: the per-format entry functions and
 * `detectCapabilities` (added as each lands in its group), `DEFAULT_LIMITS`,
 * the error model, and the public types. No internal module is re-exported.
 */

export { DEFAULT_LIMITS } from "./types.js";
export type {
  ExportFormat,
  ExportResult,
  ExportSummary,
  ExportProgress,
  ExportLimits,
  BaseExportOptions,
  Mp4Options,
  PngSequenceOptions,
  WebmAlphaOptions,
  GifOptions,
  WebpOptions,
  AudioInput,
  CapabilityResult,
  CapabilityReport,
} from "./types.js";

export type { ErrorCode, ExportError, ExportNote } from "./errors.js";

export { detectCapabilities } from "./capabilities.js";

export { exportMp4, exportPngSequence } from "./api.js";

// Entry functions are exported from their format/capability modules as each
// group lands: detectCapabilities (Group 2), exportMp4 / exportPngSequence
// (Group 4), exportGif (Group 5), exportWebmAlpha (Group 6), exportWebp
// (Group 7).
