/**
 * Export dialog state machine (Requirement 8; design state machine). Pure: no
 * DOM, no clock, no exporter calls. The dialog renders these states; the shell
 * drives the side effects (detectCapabilities, the export call, AbortController).
 */
import type { ExportResult, ExportError, CapabilityReport } from "@studio/exporters";

export type ExportFormatId = "mp4" | "png-sequence" | "gif";

export type ExportState =
  | { status: "idle" }
  | { status: "configuring"; capabilities: CapabilityReport; format: ExportFormatId }
  | { status: "running"; format: ExportFormatId; fraction: number }
  | { status: "done"; result: Extract<ExportResult, { ok: true }> }
  | { status: "failed"; error: ExportError }
  | { status: "cancelled" };

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

/** Pure transition. Unknown events in a state are no-ops (return current). */
export function reduce(state: ExportState, event: ExportEvent): ExportState {
  switch (event.type) {
    case "open":
      return { status: "configuring", capabilities: event.capabilities, format: "mp4" };
    case "select-format":
      return state.status === "configuring" ? { ...state, format: event.format } : state;
    case "start":
      return state.status === "configuring" ? { status: "running", format: state.format, fraction: 0 } : state;
    case "progress":
      return state.status === "running" ? { ...state, fraction: event.fraction } : state;
    case "success":
      return state.status === "running" ? { status: "done", result: event.result } : state;
    case "fail":
      return state.status === "running" ? { status: "failed", error: event.error } : state;
    case "cancelled":
      return state.status === "running" ? { status: "cancelled" } : state;
    case "reset":
      return { status: "idle" };
    default:
      return state;
  }
}
