/**
 * Export dialog state machine (Requirement 8; design state machine). Pure: no
 * DOM, no clock, no exporter calls. The dialog renders these states; the shell
 * drives the side effects (detectCapabilities, the export call, AbortController).
 */
import type { ExportResult, ExportError, CapabilityReport } from "@studio/exporters";

export type ExportFormatId = "mp4" | "png-sequence" | "gif";

/**
 * Every state after `open` carries the detected capabilities and the chosen format, so a terminal state can
 * return to the format step (`reset`) without detecting capabilities again.
 */
export type ExportState =
  | { status: "idle" }
  | { status: "configuring"; capabilities: CapabilityReport; format: ExportFormatId }
  | { status: "running"; capabilities: CapabilityReport; format: ExportFormatId; fraction: number }
  | { status: "done"; capabilities: CapabilityReport; format: ExportFormatId; result: Extract<ExportResult, { ok: true }> }
  | { status: "failed"; capabilities: CapabilityReport; format: ExportFormatId; error: ExportError }
  | { status: "cancelled"; capabilities: CapabilityReport; format: ExportFormatId };
export type ExportEvent =
  | { type: "open"; capabilities: CapabilityReport }
  | { type: "select-format"; format: ExportFormatId }
  | { type: "start" }
  | { type: "progress"; fraction: number }
  | { type: "success"; result: Extract<ExportResult, { ok: true }> }
  | { type: "fail"; error: ExportError }
  | { type: "cancelled" }
  | { type: "reset" };

export const INITIAL: ExportState = { status: "idle" };

/** Pure transition. Unknown events in a state are no-ops (return the same state object). */
export function reduce(state: ExportState, event: ExportEvent): ExportState {
  switch (event.type) {
    case "open":
      return { status: "configuring", capabilities: event.capabilities, format: "mp4" };
    case "select-format":
      return state.status === "configuring" ? { ...state, format: event.format } : state;
    case "start":
      return state.status === "configuring" ? { status: "running", capabilities: state.capabilities, format: state.format, fraction: 0 } : state;
    case "progress":
      return state.status === "running" ? { ...state, fraction: event.fraction } : state;
    case "success":
      return state.status === "running" ? { status: "done", capabilities: state.capabilities, format: state.format, result: event.result } : state;
    case "fail":
      return state.status === "running" ? { status: "failed", capabilities: state.capabilities, format: state.format, error: event.error } : state;
    case "cancelled":
      return state.status === "running" ? { status: "cancelled", capabilities: state.capabilities, format: state.format } : state;
    case "reset":
      // Back (after a failure or a cancel) and "Export again" (after a success) return to the format step.
      // Only a finished export can be reset; a running one is left alone (it is stopped with Cancel).
      return state.status === "done" || state.status === "failed" || state.status === "cancelled"
        ? { status: "configuring", capabilities: state.capabilities, format: state.format }
        : state;
    default:
      return state;
  }
}
