/**
 * Static data for the screens page (visual regression of the generated screens, dev-only). Plain data
 * and no-op handlers; the design tool's own scripts are never run or ported.
 */
import type { DcData } from "../src/ds/dc-runtime.js";
import { demoProject } from "../src/model/demo.js";
import { adaptEffectsLibrary } from "../src/wiring/effects-library.js";
import { adaptExportFlow } from "../src/wiring/export-flow.js";
import { effectsSpy, exportSpy, exportState, libraryState } from "../src/wiring/fixtures.js";
import { STUDIO_EDITOR_FIXTURE } from "./fixture.js";
const noop = (): void => undefined;
const project = demoProject();

const landing: DcData = {
  access: [{ t: "Free to use", d: "No account and no sign-in." }, { t: "Works offline", d: "Everything runs in your browser." }],
  privacy: [{ t: "Nothing leaves your device", d: "No uploads, no analytics." }],
  dests: [
    { name: "YouTube", ratio: "16:9", ar: "16 / 9", fh: "100%", icon: "play", meta: "1920 × 1080 · MP4", use: "Titles and lower thirds", frameClass: "ui-dest__frame" },
    { name: "Reels", ratio: "9:16", ar: "9 / 16", fh: "100%", icon: "play", meta: "1080 × 1920 · MP4", use: "Vertical stories", frameClass: "ui-dest__frame" },
  ],
  gallery: [
    { thumb: "Aa", name: "Typewriter", split: "Char", meta: "Entrance", aria: "Typewriter, split by Char" },
    { thumb: "Bb", name: "Wave", split: "Char", meta: "Loop", aria: "Wave, split by Char" },
  ],
  heroStage: null,
  heroPlayhead: null,
  onOpenStudio: noop,
};

const errorStates: DcData = {
  warnings: [
    { code: "FONT_FALLBACK", icon: "warning", kind: "warning", remove: noop, removeLabel: "Dismiss", text: "A font fell back to the default.", title: "Font not found" },
    { code: "ERR_X", icon: "error", kind: "error", remove: noop, removeLabel: "Dismiss", text: "Something stopped.", title: "Export failed" },
  ],
  warnCount: "2 warnings",
  noWarnings: false,
  anyRemoved: false,
  resetWarnings: noop,
  showOffline: true,
  hideOffline: noop,
  offlineAction: noop,
};

const effectsLibrary: DcData = {
  ...adaptEffectsLibrary(libraryState(project, { sel: "typewriter" }), effectsSpy().d).data,
};

const exportFlow: DcData = {
  ...adaptExportFlow(exportState(project, { status: "idle" }, { step: 2, format: "mp4", resolution: null }), exportSpy().d).data,
};

export const FIXTURES: Record<string, DcData> = {
  "studio-editor": STUDIO_EDITOR_FIXTURE,
  "export-flow": exportFlow,
  "effects-library": effectsLibrary,
  "error-states": errorStates,
  "landing-page": landing,
};
