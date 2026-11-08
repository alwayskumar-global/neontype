/**
 * The typed error model for `@studio/exporters` (Req 10).
 *
 * `ErrorCode` is a CLOSED string-literal union of exactly 12 values; adding or
 * removing a value is a requirements change (Req 10.2). `ExportNote` is a
 * closed, non-error note union carried on SUCCESS summaries (Req 10.7) and is
 * NOT part of `ErrorCode`. No public API throws — `fail`/`succeed` build the
 * discriminated-union `ExportResult` (Req 10.1).
 */

import type {
  ExportFormat,
  ExportResult,
  ExportSummary,
} from "./types.js";

/** The closed 12-value error-code union (Req 10.2). */
export type ErrorCode =
  | "browser-unsupported"
  | "blur-unsupported"
  | "cancelled"
  | "out-of-memory"
  | "invalid-options"
  | "audio-decode-failed"
  | "font-decode-failed"
  | "font-not-ready"
  | "empty-frame-range"
  | "encoder-failure"
  | "muxer-failure"
  | "project-invalid";

/** Every `ErrorCode` value, frozen, for closure assertions and iteration. */
export const ERROR_CODES: readonly ErrorCode[] = Object.freeze([
  "browser-unsupported",
  "blur-unsupported",
  "cancelled",
  "out-of-memory",
  "invalid-options",
  "audio-decode-failed",
  "font-decode-failed",
  "font-not-ready",
  "empty-frame-range",
  "encoder-failure",
  "muxer-failure",
  "project-invalid",
]);

/** The closed non-error note union (Req 10.7). */
export type ExportNote = "mp4-no-transparency";

/** A typed export error (Req 10.3, 10.4). Never thrown across the public API. */
export interface ExportError {
  code: ErrorCode;
  /** Human-readable, 1..500 chars, no stack trace / path / secret (Req 10.4). */
  message: string;
  /** Field paths for `project-invalid` / `invalid-options` (Req 10.5). */
  fieldPaths?: string[];
}

/** Max `ExportError.message` length (Req 10.3). */
const MAX_MESSAGE_LEN = 500;

/**
 * Clamps a message to the `[1, 500]` length contract (Req 10.3). An empty
 * message is replaced with the code so a result always carries readable text;
 * an over-long message is truncated with an ellipsis.
 */
function clampMessage(message: string, code: ErrorCode): string {
  const trimmed = message.length > 0 ? message : code;
  if (trimmed.length <= MAX_MESSAGE_LEN) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_MESSAGE_LEN - 1) + "\u2026";
}

/** Builds a failure `ExportResult` (Req 10.1). Never throws. */
export function fail(
  code: ErrorCode,
  message: string,
  fieldPaths?: string[],
): ExportResult {
  const error: ExportError = { code, message: clampMessage(message, code) };
  if (fieldPaths !== undefined && fieldPaths.length > 0) {
    error.fieldPaths = fieldPaths;
  }
  return { ok: false, error };
}

/** Builds a success `ExportResult` (Req 10.1). */
export function succeed(args: {
  format: ExportFormat;
  file: Blob;
  fileName: string;
  summary: ExportSummary;
}): ExportResult {
  return {
    ok: true,
    format: args.format,
    file: args.file,
    fileName: args.fileName,
    summary: args.summary,
  };
}
