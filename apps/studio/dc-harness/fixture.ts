/**
 * Static data for the generated Studio Editor in the smoke harness (Requirement 17.10).
 *
 * A hand-written SNAPSHOT of what the design tool's data script computed at t = 1.24 s with the
 * default state (paused, presets tab, keyframe editor open, warning shown). The design tool's script
 * (a state machine with a clock) is never run or ported; this file is plain data plus no-op handlers.
 * A unit test (dc-harness.test.ts) checks that it covers STUDIO_EDITOR_BINDINGS.
 */
import type { DcData } from "../src/ds/dc-runtime.js";

const noop = (): void => undefined;

/** Leaves a mark the Playwright spec can read, proving the generated onClick reached the data function. */
const mark = (name: string) => (): void => {
  if (typeof document !== "undefined") document.documentElement.dataset["dcClicked"] = name;
};

const L1 = Array.from("Grand Opening");
const presets = [
  { name: "ENTRANCES", items: [["Typewriter", "Char"], ["Fade-slide", "Word", true], ["Pop in", "Char"], ["Blur in", "Char"], ["Rise", "Line"], ["Track in", "Line"], ["Wave", "Char"]] },
  { name: "EXITS", items: [["Fade out", "Line"], ["Drop out", "Word"], ["Wipe off", "Line"]] },
  { name: "LOOPS", items: [["Glow pulse", "Line"], ["Flicker", "Char"]] },
] as const;

const presetGroups = presets.map((g) => ({
  name: g.name,
  items: g.items.map((item) => {
    const [name, gran] = item;
    const on = item.length === 3;
    return { name, gran, on, off: !on, aria: `${name}, split by ${gran}${on ? ", applied to selected layer" : ""}` };
  }),
}));

const ticks = Array.from({ length: 61 }, (_, i) => ({ left: `${(i / 60) * 100}%`, h: i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4 }));
const rulerLabels = Array.from({ length: 7 }, (_, i) => ({
  left: `${(i / 6) * 100}%`,
  label: `${i}s`,
  tf: i === 6 ? "translateX(calc(-100% - 4px))" : "translateX(4px)",
}));

const easeOpts = [
  { id: "linear", d: "M2 16C2 16 26 2 26 2" },
  { id: "easeIn", d: "M2 16C15.2 15.2 18.2 13.3 26 2" },
  { id: "easeOut", d: "M2 16C7.2 7.5 10.5 2 26 2" },
  { id: "easeInOut", d: "M2 16C17.5 15.4 10.5 2 26 2" },
].map((e) => ({ id: e.id, label: e.id, on: e.id === "easeOut", off: e.id !== "easeOut", d: e.d, pick: noop }));

export const STUDIO_EDITOR_FIXTURE: DcData = {
  projectName: "Grand opening - teaser",
  onName: noop,
  playing: false,
  paused: true,
  togglePlay: mark("togglePlay"),
  toStart: noop,
  toEnd: noop,
  loop: true,
  noLoop: false,
  toggleLoop: noop,
  zoomLabel: "50%",
  zoomIn: noop,
  zoomOut: noop,
  tabPresets: true,
  tabLayers: false,
  showLayers: noop,
  showPresets: noop,
  presetGroups,
  checker: false,
  noChecker: true,
  checkerAria: "false",
  toggleChecker: noop,
  safe: true,
  noSafe: false,
  safeAria: "true",
  toggleSafe: noop,
  warning: true,
  noWarning: false,
  showBanner: true,
  hideBanner: noop,
  kfOpen: true,
  toggleKf: noop,
  showSelection: true,
  l1Chars: L1.map((ch, i) => ({ ch, op: i < 9 ? 1 : 0, caret: i === 8 })),
  l2Words: [
    { w: "Sale ", op: "0.919", ty: "0.361" },
    { w: "starts ", op: "0.681", ty: "1.417" },
    { w: "Friday", op: "0.187", ty: "3.610" },
  ],
  l2dy: "0.361",
  l2s: "0.9870",
  l2op: "0.680",
  l3op: "1.000",
  posY: 564,
  opacity: 68,
  opacityPct: "68.0%",
  scale: "98.7",
  kfPos: { fill: "none", label: "Add position keyframe" },
  kfOp: { fill: "none", label: "Add opacity keyframe" },
  kfScale: { fill: "none", label: "Add scale keyframe" },
  timecode: "00:01:07",
  phLeft: "20.667%",
  ticks,
  rulerLabels,
  posEase: "easeOut",
  easeOpts,
  curve: { x1: 63.88, y1: 60.8, x2: 96.36, y2: 14, d: "M14 134C63.88 60.8 96.36 14 246 14", h1: "M14 134L63.88 60.8", h2: "M246 14L96.36 14" },
  bezText: "0.22, 0.61, 0.36, 1.00",
};
