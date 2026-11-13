/**
 * Test fixtures for the adapters: spy dispatchers and representative states. Used by the unit and
 * property tests only (not imported by app code).
 */
import type { Project } from "@studio/engine";
import type { CapabilityReport, ErrorCode, ExportResult } from "@studio/exporters";
import type { ExportState } from "../export/machine.js";
import type { EffectsLibraryDispatchers, EffectsLibraryState, EffectsLibraryView } from "./effects-library.js";
import type { ExportFlowDispatchers, ExportFlowState, ExportFlowView } from "./export-flow.js";
import type { StudioEditorDispatchers, StudioEditorState, StudioEditorView } from "./studio-editor.js";
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
    toOptions: rec("toOptions"), toDest: rec("toDest"), pickFormat: rec("pickFormat"),
    setResolution: rec("setResolution"), startExport: rec("startExport"), cancelExport: rec("cancelExport"), close: rec("close"), download: rec("download"),
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
  { step: 1, format: "png", resolution: null },
  { step: 2, format: "gif", resolution: "640 × 360" },
  { step: 2, format: "webm", resolution: "no-such-size" },
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
/** Spy dispatchers for the Studio Editor: every method records its name; the two slots are plain strings. */
export function studioSpy(): Spy<StudioEditorDispatchers> {
  const calls: string[] = [];
  const rec = (name: string) => (): void => {
    calls.push(name);
  };
  const d: StudioEditorDispatchers = {
    newProject: rec("newProject"), loadDemo: rec("loadDemo"), save: rec("save"), open: rec("open"), exportProject: rec("exportProject"),
    undo: rec("undo"), setCanvasSize: rec("setCanvasSize"), setWidth: rec("setWidth"), setHeight: rec("setHeight"), setFps: rec("setFps"),
    setDuration: rec("setDuration"), setBackground: rec("setBackground"), setTransparent: rec("setTransparent"), addLayer: rec("addLayer"),
    selectLayer: rec("selectLayer"), moveLayer: rec("moveLayer"), deleteLayer: rec("deleteLayer"), setText: rec("setText"),
    setFont: rec("setFont"), setWeight: rec("setWeight"), setSize: rec("setSize"), setFill: rec("setFill"), setAlign: rec("setAlign"),
    setAnchor: rec("setAnchor"), setLayerTiming: rec("setLayerTiming"), setEffectGranularity: rec("setEffectGranularity"),
    setEffectParam: rec("setEffectParam"), removeEffect: rec("removeEffect"), rejectEffectParam: rec("rejectEffectParam"), back: rec("back"), openLibrary: rec("openLibrary"), togglePlay: rec("togglePlay"),
    toStart: rec("toStart"), toEnd: rec("toEnd"), toggleLoop: rec("toggleLoop"), toggleChecker: rec("toggleChecker"), toggleSafe: rec("toggleSafe"),
    stage: "stage", timeline: "timeline",
  };
  return { d, calls };
}
export const EMPTY_STUDIO_VIEW: StudioEditorView = { checker: false, safe: true, settingsError: null, paramErrors: {} };
export function studioState(project: Project, patch: Partial<Omit<StudioEditorState, "project">> = {}): StudioEditorState {
  return {
    project,
    selectedLayerId: project.layers[0]?.id ?? null,
    playhead: 1.24,
    loop: true,
    playing: false,
    canUndo: true,
    view: EMPTY_STUDIO_VIEW,
    ...patch,
  };
}
