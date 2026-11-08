/**
 * ErrorCode -> human message map (Requirement 8.6). Exhaustive over the
 * exporters' closed 12-value ErrorCode union: the Record is keyed by ErrorCode,
 * so removing/adding a code fails to compile. `messageFor` never returns empty.
 */
import type { ErrorCode } from "@studio/exporters";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "browser-unsupported": "This format isn't supported by your browser. Try MP4 or PNG sequence.",
  "blur-unsupported": "This browser can't render the blur effect for export.",
  cancelled: "Export cancelled.",
  "out-of-memory": "Ran out of memory - try a smaller size, fewer frames, or a shorter duration.",
  "invalid-options": "An export setting is out of range. Please adjust it and try again.",
  "audio-decode-failed": "Audio couldn't be decoded.",
  "font-decode-failed": "A font failed to load, so the export can't run.",
  "font-not-ready": "Fonts aren't ready yet. Try again in a moment.",
  "empty-frame-range": "This project has no frames to export.",
  "encoder-failure": "Encoding failed. Try again or pick another format.",
  "muxer-failure": "Writing the file failed. Try again or pick another format.",
  "project-invalid": "The project is invalid and can't be exported.",
};

/** The message for a code (always non-empty). */
export function messageFor(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}
