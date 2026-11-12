/**
 * Adapter for the generated Studio Editor screen (Requirement 19.2). Pure: store snapshot, the host's
 * editor view state, and the host services in; the screen's `data` out. All 70 bindings are backed.
 *
 * Differences from the design's own data script, all deliberate:
 *  - Fonts and weights are the bundled ones (Noto Sans, Noto Sans Tamil; Regular and Bold), not the design's samples.
 *  - Size presets are the design's four plus 1280 × 720 (the default project) and "Custom" when none matches.
 *  - Anchor X and Y are shown as fractions of the canvas (the design's unit); the project stores pixels.
 *  - Limits (size, frame rate, duration) are the model's; the design's `min`/`max` attributes are hints only.
 * Handlers receive the DOM change event (or a plain value) and parse it here; a value that does not parse
 * calls nothing. The host owns validation messages (`view.settingsError`) because it sees whether the
 * model accepted an edit.
 */
import { presetCatalog, type Granularity, type Project, type TextLayer } from "@studio/engine";
import type { DcProps, DcValue } from "../ds/dc-runtime.js";
import { FONT_FAMILIES, type FontFamily } from "../model/project.js";
import { GRAN_LABEL } from "./effects-library.js";
import { RANGES_BY_ID } from "./tables.js";
import { decimals, timecode, withUnit } from "./format.js";
import type { Data } from "./types.js";
/** The editor's own view state (held by the host, never saved). */
export interface StudioEditorView {
  checker: boolean;
  safe: boolean;
  /** The message for a rejected settings edit, or null. */
  settingsError: string | null;
}
export interface StudioEditorState {
  project: Project;
  selectedLayerId: string | null;
  playhead: number;
  loop: boolean;
  playing: boolean;
  canUndo: boolean;
  view: StudioEditorView;
}
/** Everything the adapter's handlers may call, plus the two slot nodes. The host builds this object. */
export interface StudioEditorDispatchers {
  newProject(): void;
  loadDemo(): void;
  save(): void;
  open(): void;
  exportProject(): void;
  undo(): void;
  setCanvasSize(width: number, height: number): void;
  setWidth(width: number): void;
  setHeight(height: number): void;
  setFps(fps: number): void;
  setDuration(seconds: number): void;
  setBackground(hex: string): void;
  setTransparent(transparent: boolean): void;
  addLayer(): void;
  selectLayer(id: string): void;
  moveLayer(id: string, toIndex: number): void;
  deleteLayer(id: string): void;
  setText(id: string, text: string): void;
  setFont(id: string, family: FontFamily): void;
  setWeight(id: string, weight: string): void;
  setSize(id: string, size: number): void;
  setFill(id: string, hex: string): void;
  setAlign(id: string, align: "left" | "center" | "right"): void;
  /** Anchor in canvas pixels. */
  setAnchor(id: string, x: number, y: number): void;
  setLayerTiming(id: string, startSeconds: number, endSeconds: number): void;
  setEffectGranularity(layerId: string, index: number, granularity: Granularity): void;
  setEffectParam(layerId: string, index: number, key: string, value: number): void;
  removeEffect(layerId: string, index: number): void;
  /** Opens the Effects Library for the selected layer. */
  openLibrary(): void;
  togglePlay(): void;
  toStart(): void;
  toEnd(): void;
  toggleLoop(): void;
  toggleChecker(): void;
  toggleSafe(): void;
  /** Host services: the live preview canvas and the live timeline, mounted into the screen's slots. */
  stage: DcValue;
  timeline: DcValue;
}
/** Binding keys without backing behaviour in v1: none. */
export const INERT_BINDINGS: readonly string[] = [];
interface Preset {
  readonly value: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}
export const SIZE_PRESETS: readonly Preset[] = [
  { value: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 },
  { value: "hd", label: "HD 16:9 · 1280 × 720", width: 1280, height: 720 },
  { value: "square", label: "Square 1:1", width: 1080, height: 1080 },
  { value: "portrait", label: "Portrait 9:16", width: 1080, height: 1920 },
  { value: "classic", label: "Classic 4:3", width: 1440, height: 1080 },
];
export const WEIGHTS: readonly { value: string; label: string }[] = [
  { value: "400", label: "Regular · 400" },
  { value: "700", label: "Bold · 700" },
];
const ALIGNS = [["left", "Left"], ["center", "Center"], ["right", "Right"]] as const;
/** The value of a change event (`event.target.value`) or of a plain value. */
function raw(e: unknown): unknown {
  if (typeof e === "object" && e !== null && "target" in e) return (e as { target?: { value?: unknown } }).target?.value;
  return e;
}
function text(e: unknown): string | null {
  const v = raw(e);
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}
function num(e: unknown): number | null {
  const v = raw(e);
  if (v === "" || v === null || v === undefined || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** The first line of a layer's text, or a placeholder (the design's rule). */
export function layerName(layer: TextLayer): string {
  return layer.text.split("\n")[0] || "Empty text";
}
const round = (n: number, places: number): number => Number(n.toFixed(places));
function presetValue(width: number, height: number): string {
  return SIZE_PRESETS.find((p) => p.width === width && p.height === height)?.value ?? "custom";
}
export function adaptStudioEditor(state: StudioEditorState, d: StudioEditorDispatchers): DcProps {
  const { project, view } = state;
  const { width, height, fps, durationSeconds } = project.canvas;
  const layer = project.layers.find((l) => l.id === state.selectedLayerId);
  const transparent = project.background === "transparent";
  const fontOpts = (current: string): { value: string; label: string }[] => {
    const list: { value: string; label: string }[] = FONT_FAMILIES.map((f) => ({ value: f, label: f }));
    return current === "" || list.some((o) => o.value === current) ? list : [...list, { value: current, label: current }];
  };
  const weightOpts = (current: string): { value: string; label: string }[] => {
    const list = WEIGHTS.map((w) => ({ ...w }));
    return current === "" || list.some((o) => o.value === current) ? list : [...list, { value: current, label: current }];
  };
  const layers: DcValue[] = project.layers.map((l, i) => ({
    name: layerName(l),
    selected: l.id === state.selectedLayerId,
    select: () => d.selectLayer(l.id),
    moveUp: () => {
      if (i > 0) d.moveLayer(l.id, i - 1);
    },
    moveDown: () => {
      if (i < project.layers.length - 1) d.moveLayer(l.id, i + 1);
    },
    canMoveUp: i > 0,
    canMoveDown: i < project.layers.length - 1,
    remove: () => d.deleteLayer(l.id),
  }));
  const effects: DcValue[] = layer
    ? layer.effectInstances.map((inst, index) => {
        const entry = presetCatalog.find((p) => p.id === inst.effectId);
        const supported = entry?.supportedGranularities ?? [inst.granularity];
        const ranges = RANGES_BY_ID[inst.effectId] ?? {};
        return {
          name: entry?.displayName ?? inst.effectId,
          split: inst.granularity,
          splitOpts: supported.map((g) => ({ value: g, label: GRAN_LABEL[g] })),
          onSplit: (e: unknown) => {
            const v = text(e);
            const g = supported.find((x) => x === v);
            if (g !== undefined) d.setEffectGranularity(layer.id, index, g);
          },
          params: Object.entries(ranges).map(([key, r]) => {
            const stored = inst.params[key];
            const def = entry?.defaultParams[key];
            const val = typeof stored === "number" ? stored : typeof def === "number" ? def : r.min;
            return {
              label: r.label,
              min: r.min,
              max: r.max,
              step: r.step,
              val,
              fmt: withUnit(val, r.step, r.unit),
              set: (e: unknown) => {
                const n = num(e);
                if (n !== null) d.setEffectParam(layer.id, index, key, round(n, Math.max(decimals(r.step), 0)));
              },
            };
          }),
          remove: () => d.removeEffect(layer.id, index),
        };
      })
    : [];
  const onLayerNumber = (apply: (l: TextLayer, n: number) => void) => (e: unknown): void => {
    const n = num(e);
    if (layer && n !== null) apply(layer, n);
  };
  const onLayerText = (apply: (l: TextLayer, v: string) => void) => (e: unknown): void => {
    const v = text(e);
    if (layer && v !== null) apply(layer, v);
  };
  const data: Data = {
    addEffect: () => d.openLibrary(),
    addLayer: () => d.addLayer(),
    alignOpts: ALIGNS.map(([value, label]) => ({
      label,
      on: layer?.align === value,
      pick: () => {
        if (layer) d.setAlign(layer.id, value);
      },
    })),
    anchorX: layer ? round(layer.anchor.x / width, 4) : "",
    anchorY: layer ? round(layer.anchor.y / height, 4) : "",
    background: transparent ? "#101018" : project.background,
    canUndo: state.canUndo,
    canvasHeight: height,
    canvasPreset: presetValue(width, height),
    canvasPresetOpts: [...SIZE_PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: "custom", label: "Custom" }],
    canvasWidth: width,
    checker: view.checker,
    checkerAria: String(view.checker),
    duration: durationSeconds,
    effects,
    fill: layer?.fill ?? "#FFFFFF",
    font: layer?.fontFamily ?? "",
    fontOpts: fontOpts(layer?.fontFamily ?? ""),
    fps,
    hasLayer: layer !== undefined,
    hasSettingsError: view.settingsError !== null,
    layerDuration: layer ? round(layer.endSeconds - layer.startSeconds, 3) : "",
    layerStart: layer ? layer.startSeconds : "",
    layerText: layer?.text ?? "",
    layers,
    loop: state.loop,
    noChecker: !view.checker,
    noLoop: !state.loop,
    noSafe: !view.safe,
    onAnchorX: onLayerNumber((l, n) => d.setAnchor(l.id, round(n * width, 2), l.anchor.y)),
    onAnchorY: onLayerNumber((l, n) => d.setAnchor(l.id, l.anchor.x, round(n * height, 2))),
    onBackground: (e: unknown) => {
      const v = text(e);
      if (v !== null) d.setBackground(v);
    },
    onCanvasHeight: (e: unknown) => {
      const n = num(e);
      if (n !== null) d.setHeight(n);
    },
    onCanvasPreset: (e: unknown) => {
      const p = SIZE_PRESETS.find((x) => x.value === text(e));
      if (p) d.setCanvasSize(p.width, p.height);
    },
    onCanvasWidth: (e: unknown) => {
      const n = num(e);
      if (n !== null) d.setWidth(n);
    },
    onDuration: (e: unknown) => {
      const n = num(e);
      if (n !== null) d.setDuration(n);
    },
    onExport: () => d.exportProject(),
    onFill: onLayerText((l, v) => d.setFill(l.id, v)),
    onFont: onLayerText((l, v) => {
      const f = FONT_FAMILIES.find((x) => x === v);
      if (f !== undefined) d.setFont(l.id, f);
    }),
    onFps: (e: unknown) => {
      const n = num(e);
      if (n !== null) d.setFps(n);
    },
    onLayerDuration: onLayerNumber((l, n) => d.setLayerTiming(l.id, l.startSeconds, l.startSeconds + n)),
    onLayerStart: onLayerNumber((l, n) => d.setLayerTiming(l.id, n, l.endSeconds)),
    onLayerText: (e: unknown) => {
      const v = text(e);
      if (layer && v !== null) d.setText(layer.id, v);
    },
    onLoadDemo: () => d.loadDemo(),
    onNew: () => d.newProject(),
    onOpen: () => d.open(),
    onSave: () => d.save(),
    onSize: onLayerNumber((l, n) => d.setSize(l.id, n)),
    onTransparent: () => d.setTransparent(!transparent),
    onWeight: onLayerText((l, v) => d.setWeight(l.id, v)),
    paused: !state.playing,
    playing: state.playing,
    safe: view.safe,
    safeAria: String(view.safe),
    settingsError: view.settingsError ?? "",
    size: layer ? layer.fontSize : "",
    stage: d.stage,
    stageAspect: `${width} / ${height}`,
    timecode: timecode(Math.min(Math.max(state.playhead, 0), durationSeconds), fps),
    timeline: d.timeline,
    toEnd: () => d.toEnd(),
    toStart: () => d.toStart(),
    toggleChecker: () => d.toggleChecker(),
    toggleLoop: () => d.toggleLoop(),
    togglePlay: () => d.togglePlay(),
    toggleSafe: () => d.toggleSafe(),
    transparent,
    undo: () => d.undo(),
    weight: layer ? String(layer.fontWeight) : "",
    weightOpts: weightOpts(layer ? String(layer.fontWeight) : ""),
  };
  return { data };
}
