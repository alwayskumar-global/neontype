/**
 * Test fixtures for the adapters: spy dispatchers and representative states. Used by the unit and
 * property tests only (not imported by app code).
 */
import { presetCatalog, type Project } from "@studio/engine";
import type { CapabilityReport, ErrorCode, ExportResult } from "@studio/exporters";
import type { ExportState } from "../export/machine.js";
import type { EffectsLibraryDispatchers, EffectsLibraryState, EffectsLibraryView } from "./effects-library.js";
import type { ExportFlowDispatchers, ExportFlowState, ExportFlowView } from "./export-flow.js";
export interface Spy<T> {
  d: T;
  calls: string[];
}
/** Spy dispatchers for the Effects Library: every method records its name, except the `thumb` service. */
export function effectsSpy(): Spy<EffectsLibraryDispatchers> {
  const calls: string[] = [];
  const rec = (name: string) => (): void => {
    calls.push(name);
  };
  const d: EffectsLibraryDispatchers = {
    setOpen: rec("setOpen"), setQuery: rec("setQuery"), toggleGran: rec("toggleGran"), toggleCat: rec("toggleCat"),
    clearFilters: rec("clearFilters"), setSort: rec("setSort"), select: rec("select"), setHover: rec("setHover"),
    setFocus: rec("setFocus"), stageSplit: rec("stageSplit"), stageEase: rec("stageEase"), stageParam: rec("stageParam"),
    applyEffect: rec("applyEffect"), undo: rec("undo"), dismissToast: rec("dismissToast"), gridKey: rec("gridKey"),
    thumb: () => null, searchRef: { current: null }, gridRef: { current: null },
  };
  return { d, calls };
}
export function exportSpy(): Spy<ExportFlowDispatchers> {
  const calls: string[] = [];
  const rec = (name: string) => (): void => {
    calls.push(name);
  };
  const d: ExportFlowDispatchers = {
    toOptions: rec("toOptions"), toDest: rec("toDest"), pickDestination: rec("pickDestination"),
    setResolution: rec("setResolution"), pickPng: rec("pickPng"), startExport: rec("startExport"), cancelExport: rec("cancelExport"),
  };
  return { d, calls };
}
export const EMPTY_LIBRARY_VIEW: EffectsLibraryView = {
  open: true, query: "", grans: [], cats: [], sort: "az", sel: null, hover: null, focusId: null, staged: {}, toast: null,
};
export function libraryState(project: Project, view: Partial<EffectsLibraryView> = {}): EffectsLibraryState {
  return { project, selectedLayerId: project.layers[0]?.id ?? null, view: { ...EMPTY_LIBRARY_VIEW, ...view } };
}
export const ALL_ERROR_CODES: readonly ErrorCode[] = [
  "browser-unsupported", "blur-unsupported", "cancelled", "out-of-memory", "invalid-options", "audio-decode-failed",
  "font-decode-failed", "font-not-ready", "empty-frame-range", "encoder-failure", "muxer-failure", "project-invalid",
];
export const SUPPORTED_CAPS = ((): CapabilityReport => {
  const ok = { status: "supported" } as const;
  const no = { status: "unsupported", reason: "not in this release" } as const;
  return { mp4: ok, webmAlpha: no, gif: ok, webp: no, aac: ok, pngSequence: ok, embed: no };
})();
export function doneResult(name: string): Extract<ExportResult, { ok: true }> {
  return {
    ok: true, format: "mp4", file: new Blob(["x"]), fileName: name,
    summary: { width: 1280, height: 720, fps: 30, frameCount: 150, byteSize: 123456, notes: [] },
  };
}
export const EXPORT_VIEWS: ExportFlowView[] = [
  { step: 1, destination: "overlay", resolution: null },
  { step: 2, destination: "youtube", resolution: "640 × 360" },
  { step: 2, destination: "square", resolution: "no-such-size" },
];
export function exportRuns(code: ErrorCode = "out-of-memory"): ExportState[] {
  const base = { capabilities: SUPPORTED_CAPS, format: "mp4" as const };
  return [
    { status: "idle" },
    { status: "configuring", ...base },
    { status: "running", ...base, format: "gif", fraction: 0.4 },
    { status: "done", ...base, result: doneResult("title-youtube.mp4") },
    { status: "failed", ...base, error: { code, message: "x" } },
    { status: "cancelled", ...base },
  ];
}
export function exportState(project: Project, run: ExportState, view: ExportFlowView): ExportFlowState {
  return { project, run, view };
}
export const CATALOG_IDS: readonly string[] = presetCatalog.map((p) => p.id);
