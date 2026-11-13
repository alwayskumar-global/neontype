/**
 * Static data for the generated Studio Editor in the smoke harness (Requirement 17.10).
 *
 * A hand-written SNAPSHOT of what the design's data script computes for the demo project (paused, one
 * layer selected, Safe area on). The design tool's script is never run or ported; this file is plain
 * data plus no-op handlers. A unit test (render.test.tsx) checks that it covers STUDIO_EDITOR_BINDINGS.
 */
import type { DcData } from "../src/ds/dc-runtime.js";
const noop = (): void => undefined;
/** Leaves a mark the Playwright spec can read, proving the generated onClick reached the data function. */
export const mark = (name: string) => (): void => {
  if (typeof document !== "undefined") document.documentElement.dataset["dcClicked"] = name;
};
const opt = (value: string, label: string) => ({ value, label });
export const STUDIO_EDITOR_FIXTURE: DcData = {
  stageAspect: "1280 / 720",
  stage: null,
  timeline: null,
  onBack: noop, onNew: noop, onLoadDemo: noop, onSave: noop, onOpen: noop, onExport: noop, undo: noop, canUndo: true,
  canvasPreset: "hd", canvasPresetOpts: [opt("hd", "HD 1280 × 720"), opt("sq", "Square 1080")], onCanvasPreset: noop,
  canvasWidth: 1280, onCanvasWidth: noop, canvasHeight: 720, onCanvasHeight: noop,
  fps: 30, onFps: noop, duration: 6, onDuration: noop,
  background: "#101018", onBackground: noop, transparent: false, onTransparent: noop,
  settingsError: "", hasSettingsError: false,
  layers: [
    { name: "Motion Text", selected: true, select: noop, moveUp: noop, moveDown: noop, canMoveUp: false, canMoveDown: true, remove: noop },
    { name: "வணக்கம்", selected: false, select: noop, moveUp: noop, moveDown: noop, canMoveUp: true, canMoveDown: true, remove: noop },
    { name: "Subtitle", selected: false, select: noop, moveUp: noop, moveDown: noop, canMoveUp: true, canMoveDown: false, remove: noop },
  ],
  addLayer: noop, hasLayer: true,
  layerText: "Motion Text", onLayerText: noop,
  font: "Noto Sans", fontOpts: [opt("Noto Sans", "Noto Sans"), opt("Noto Sans Tamil", "Noto Sans Tamil")], onFont: noop,
  weight: "700", weightOpts: [opt("400", "Regular"), opt("700", "Bold")], onWeight: noop,
  size: 120, onSize: noop, fill: "#FFCC00", onFill: noop,
  alignOpts: [{ label: "Left", on: false, pick: noop }, { label: "Center", on: true, pick: noop }, { label: "Right", on: false, pick: noop }],
  anchorX: 0.5, onAnchorX: noop, anchorY: 0.42, onAnchorY: noop,
  layerStart: 0, onLayerStart: noop, layerDuration: 6, onLayerDuration: noop,
  effects: [
    {
      name: "Kinetic pop", split: "char", splitOpts: [opt("char", "Character"), opt("word", "Word")], onSplit: noop, remove: noop,
      params: [
        { kind: "number", isNumber: true, isEnum: false, label: "Duration", min: 0.1, max: 3, step: 0.05, opts: [], val: 0.5, err: "", hasErr: false, set: noop },
        { kind: "number", isNumber: true, isEnum: false, label: "Overshoot", min: 0, max: 1, step: 0.05, opts: [], val: 0.3, err: "Enter a number", hasErr: true, set: noop },
        { kind: "enum", isNumber: false, isEnum: true, label: "Direction", min: 0, max: 0, step: 0, opts: [{ value: "forward", label: "Forward" }, { value: "backward", label: "Backward" }], val: "forward", err: "", hasErr: false, set: noop },
      ],
    },
  ],
  addEffect: noop,
  playing: false, paused: true, togglePlay: mark("togglePlay"), toStart: noop, toEnd: noop,
  loop: true, noLoop: false, toggleLoop: noop, timecode: "00:01:07",
  checker: false, noChecker: true, checkerAria: "false", toggleChecker: noop,
  safe: true, noSafe: false, safeAria: "true", toggleSafe: noop,
};

