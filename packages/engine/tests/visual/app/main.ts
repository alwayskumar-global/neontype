/**
 * Visual test harness page (Task 12.1).
 *
 * This module is the browser entry point for the Playwright golden-image tests.
 * It self-hosts the two OFL fonts used by the fixtures (Noto Sans for Latin and
 * Noto Sans Tamil for Tamil), waits for them to finish loading, and then exposes
 * two globals the Playwright spec drives:
 *
 *   - `window.fontsReady`  — flipped to `true` after `document.fonts.ready`
 *     resolves, so the spec can block on a stable, fully-fonted canvas before
 *     taking a screenshot.
 *   - `window.render(state)` — paints a committed `FrameState` fixture onto the
 *     page canvas by calling the engine's `drawFrame`. No `computeFrameState`
 *     or `renderFrame` runs here: the fixtures are precomputed and committed,
 *     and this page only exercises the thin `drawFrame` painter.
 *
 * The `@font-face` declarations point at the woff2 files copied from the
 * `@fontsource/noto-sans` and `@fontsource/noto-sans-tamil` packages into
 * `tests/visual/fonts/`. Vite serves `tests/visual/app` as root, so the fonts
 * live one directory up at `../fonts/`.
 */

import { drawFrame } from "@studio/engine";
import type { FrameState } from "@studio/engine";

// A minimal structural type for the FrameState the fixtures carry. The spec
// hands us plain JSON parsed from the committed fixtures; `drawFrame` consumes
// the real `FrameState`, so we cast at the boundary.
declare global {
  interface Window {
    fontsReady: boolean;
    render: (state: FrameState) => void;
  }
}

// Resolve the self-hosted woff2 files through Vite's asset pipeline. The fonts
// live at `tests/visual/fonts/`, one level above this app root, which Vite will
// not serve via a bare relative `url(...)` in an injected <style>. `new URL(..,
// import.meta.url)` makes Vite rewrite each path to a URL it actually serves
// (dev) or bundles (build), so the browser receives the real woff2 binary.
const notoSansUrl = new URL(
  "../fonts/noto-sans-latin-400-normal.woff2",
  import.meta.url,
).href;
const notoSansTamilUrl = new URL(
  "../fonts/noto-sans-tamil-tamil-400-normal.woff2",
  import.meta.url,
).href;

const FONT_CSS = `
@font-face {
  font-family: "Noto Sans";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("${notoSansUrl}") format("woff2");
}
@font-face {
  font-family: "Noto Sans Tamil";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("${notoSansTamilUrl}") format("woff2");
}
`;

const style = document.createElement("style");
style.textContent = FONT_CSS;
document.head.appendChild(style);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

window.fontsReady = false;
window.render = (state: FrameState): void => {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2D canvas context unavailable.");
  }
  drawFrame(ctx, state);
};

// Force both faces to load (an @font-face is only fetched when first used), then
// signal readiness once the document reports all fonts settled.
void Promise.all([
  document.fonts.load('400 48px "Noto Sans"'),
  document.fonts.load('400 48px "Noto Sans Tamil"'),
])
  .then(() => document.fonts.ready)
  .then(() => {
    window.fontsReady = true;
  });
