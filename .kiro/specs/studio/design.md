# Design Document

**Spec:** studio (the app)

## Overview

`studio` is a React + Vite single-page app in `apps/studio` that edits an engine
`Project`, previews it on a canvas via the engine's pure render path, and exports
it with `@studio/exporters`. It owns no render, schema, or encoding logic. The
design keeps a pure, DOM-free model layer (the single source of truth) separate
from a thin React shell that holds the only playback clock, so state is testable
and preview/export stay in parity. This document covers module layout, state,
the preview pipeline, fonts, the timeline, the export state machine, save/load,
CSP/security, performance measurement, correctness properties, the Playwright
plan, dependencies, and risks.

## Architecture

### Module layout (`apps/studio/src`)

```
apps/studio/src/
  model/            PURE. No DOM, no clock, no React.
    project.ts        new-project factory + ProjectDraft helpers (wraps engine Project)
    transitions.ts    pure (Project, action) -> Project reducers (layers, settings, effects, timeline)
    selectors.ts      pure derived reads (frameCount, layer by id, active layers at t, ...)
    timemap.ts        pure time<->pixel mapping for the timeline
    actions.ts        the discriminated-union Action type
  playback/         The ONLY place allowed to read a clock.
    clock.ts          rAF loop; emits current time; play/pause/loop/scrub; owns requestAnimationFrame
    perf.ts           frame-interval instrument (mean + p95) for Requirement 13
  preview/
    PreviewCanvas.tsx owns the preview <canvas>, its CanvasMetricsProvider, and the per-frame draw
    draw.ts           thin: calls engine renderFrame(project, t, { ctx, metricsProvider })
  timeline/
    Timeline.tsx      rows, bars, playhead; pointer handlers call model/timemap + transitions
    drag.ts           pure drag math (move/trim), reused by pointer and keyboard paths
  panels/
    SettingsPanel.tsx canvas size/presets, fps, duration, background + transparent toggle
    LayersPanel.tsx   add/edit/delete/reorder + per-layer font/size/weight/colour/align/position/timing
    EffectsPanel.tsx  preset picker from presetCatalog, param editors, granularity, remove
  fonts/
    fonts.ts          FontFace registration + readiness gate; manifest of bundled families
    fonts.css         @font-face rules (self-hosted woff2, no network)
  io/
    save.ts           serializeProject -> Blob download
    load.ts           file input -> parseProject -> typed result
  export/
    dialog.tsx        the export UI
    machine.ts        pure export state machine (idle/configuring/running/done/failed/cancelled)
    errors.ts         ErrorCode -> human message map (all 12 values)
  shell/
    App.tsx           composition root; wires store + playback + panels; holds no project state itself
    store.ts          tiny subscribe/getState store around the Project + UI state
  tokens.css          design tokens extracted from design/ (no copied markup/scripts)
  main.tsx            React root
```

Intra-package imports use ESM paths with explicit `.js`/`.jsx`-less TS specifiers
per repo convention; the model layer is importable in Node for Vitest.

## Data Models

### State

- **One `Project` store** (`shell/store.ts`): holds the current `Project` plus a
  separate `UiState` (selected layer id, playhead time, loop flag, export-dialog
  state). The store is a minimal `getState` / `setState` / `subscribe` object; no
  state-management dependency.
- **Pure transitions**: every project mutation is `transitions.ts: (project,
  action) => project`. The store applies them; React never mutates the `Project`
  directly. Transitions validate against `ProjectSchema` (or a field-level guard)
  and return the unchanged input on an invalid action (surfacing an inline error
  via UI state, not by throwing).
- **Selection and playhead are NOT in the `Project`**: they live in `UiState`, so
  they never leak into saved JSON (Requirement 10.5). `serializeProject` only
  sees the `Project`.
- **React subscribes, it does not own frames**: components `useSyncExternalStore`
  over the store for structural state (layers, settings, selection). The PLAYHEAD
  during playback does NOT go through React state per frame — see Preview.

## Components and Interfaces

### Preview pipeline

- `PreviewCanvas` creates ONE `<canvas>` at the project canvas pixel size
  (`width`×`height`) and ONE `CanvasMetricsProvider(ctx)` bound to its 2D context.
  The provider (and thus its layout cache) is owned by the preview alone; exports
  create their own canvas + provider inside `@studio/exporters` (Requirement 1.1,
  9.3).
- The `playback/clock.ts` rAF loop computes `t` from elapsed real time (the only
  clock in the app) and calls `preview/draw.ts` directly with the current
  `Project` snapshot and `t`. Draw calls `renderFrame(project, t, { ctx,
  metricsProvider })`. This bypasses React's render cycle: a frame is a canvas
  draw, not a component re-render, so playback does not re-render React per frame.
  React re-renders only when structural state changes (a layer edited, etc.),
  which updates the snapshot the clock reads.
- **CSS fit**: the backing store stays at canvas pixels (preview pixels == export
  pixels, preserving parity); the element is scaled to fit its container via CSS
  `transform: scale(...)` / `max-width`, never by resizing the backing store.
- **Transparent background**: a CSS checkerboard sits behind the canvas element so
  transparency reads visually (Requirement 2.6); the canvas itself is cleared to
  transparent by the engine.
- **Parity test design** (Requirement 9): a Playwright test renders a fixed
  `Project` at a fixed frame index two ways — (1) the preview path
  (`renderFrame` into the preview canvas) and (2) the exporter's `FrameRenderer`
  (the same path exporters use) into its own canvas — composites both over the
  same opaque background, and asserts a per-channel diff ratio within the same
  tolerance the exporter golden uses (24/255 per channel, diffRatio <= 0.01).
  Each canvas uses its own `CanvasMetricsProvider`; no layout cache is shared.
  Because blur in both paths goes through the exporter's deterministic blur
  (the studio never sets a browser `ctx.filter` blur for final output), blurred
  frames stay in parity.

### Fonts

- **Bundled files** (self-hosted woff2; Noto Sans reused from the engine's
  vendored set, the 700 weights and the Tamil 400/700 added from the same
  OFL-1.1 source), family + weight 400 (normal) and 700 (bold) for BOTH families
  — four woff2 files:
  - `noto-sans-latin-400-normal.woff2`, `noto-sans-latin-700-normal.woff2` →
    family **"Noto Sans"** (Latin), OFL-1.1.
  - `noto-sans-tamil-tamil-400-normal.woff2`, `noto-sans-tamil-tamil-700-normal.woff2`
    → family **"Noto Sans Tamil"** (Tamil), OFL-1.1.
  Each family ships its OFL-1.1 licence file alongside the woff2. Copied into
  `apps/studio/src/fonts/` (or `public/fonts/`) at build time; no `@fontsource`
  runtime import, no CDN. These two families (weights 400/700) are the only
  `fontFamily` values offered in the layer font picker; the per-layer
  `fontWeight` control selects 400 or 700.
- **@font-face**: `fonts.css` declares both families with `font-display: block`
  and `src: url(...) format("woff2")` pointing at the bundled files.
- **Readiness gate** (`fonts/fonts.ts`): on startup the app constructs `FontFace`
  objects (or reads `document.fonts`), calls `.load()`, adds them to
  `document.fonts`, and awaits `document.fonts.ready` BEFORE the first preview
  frame (Requirement 6.3). The gate exposes `whenFontsReady(): Promise<FontStatus>`.
- **Error mapping**: the gate maps failure to the exporter error vocabulary used
  by the UI: a load timeout → `font-not-ready`; a decode failure (the woff2 fails
  to parse) → `font-decode-failed`. Export is blocked until the gate resolves
  ready; a non-ready gate shows the mapped message and does not start an export
  (Requirement 6.4, 6.5).

### Timeline interaction model

- **Mapping** (`model/timemap.ts`, pure): `timeToX(t, axisWidthPx, durationSeconds)`
  and `xToTime(x, axisWidthPx, durationSeconds)` are inverse within one pixel.
  No clock, no DOM; unit- and property-tested.
- **Drag math** (`timeline/drag.ts`, pure): given a drag kind (`move` |
  `trim-start` | `trim-end`), the grabbed layer's current `startSeconds`/
  `endSeconds`, and a time delta, returns the new `{ startSeconds, endSeconds }`
  clamped so `0 <= startSeconds`, `endSeconds > startSeconds`, and `endSeconds <=
  durationSeconds`. `move` preserves duration; trims move only the dragged edge.
  The same function serves pointer drags and keyboard nudges.
- **Pointer vs. keyboard**: pointer handlers convert client X to a time delta via
  `timemap`, then apply `drag.ts`, then dispatch a timeline transition. Keyboard
  equivalents (Requirement 12.6) are numeric `startSeconds`/duration inputs on the
  layer row plus arrow-key nudges on a focused bar, both routing through the same
  `drag.ts` math. A completed drag/nudge dispatches one transition; the result is
  `ProjectSchema`-valid by construction.
- Playhead drag reuses `xToTime` and calls the same scrub path as Requirement 1.5.

### Export dialog state machine (`export/machine.ts`, pure)

States and transitions (pure reducer; the dialog component renders them, the
shell drives side effects):

```
idle ──open──▶ configuring ──start──▶ running ──success──▶ done
                   ▲                     │  │
                   │                     │  └──error────▶ failed
                   └───reset──(done/failed/cancelled)    │
                                         └──cancel──▶ cancelled
```

- **configuring**: the dialog has a `CapabilityReport` from `detectCapabilities()`
  (called once on open). Formats offered are exactly MP4, PNG sequence, GIF
  (Requirement 8.1); a format whose `CapabilityResult.status === "unsupported"`
  is disabled with its `reason`. Per-format option fields are seeded from the
  project (MP4: `videoBitrate`, `backgroundFallback`, output size; PNG/GIF: output
  size).
- **running**: the shell calls the chosen `@studio/exporters` entry
  (`exportMp4`/`exportPngSequence`/`exportGif`) with `{ onProgress, signal }`.
  `onProgress.fraction` drives the progress bar. An `AbortController` is created
  per run; `signal` is passed to the exporter; Cancel calls `controller.abort()`.
- **done**: holds the `ExportResult` success; the dialog offers the produced
  `file` for download under `result.fileName`. If the project background is
  `transparent` and the format is MP4, the `mp4-no-transparency` note (read from
  `result.summary.notes`) is shown (Requirement 8.8).
- **failed**: holds the `ExportError`; the dialog shows `errors.ts`'s message for
  that `ErrorCode` (never a raw exception).
- **cancelled**: reached when the result is the `cancelled` error; no file.

**ErrorCode → message map** (`export/errors.ts`) covers ALL 12 values:

| ErrorCode | User-facing message (summary) |
| --- | --- |
| `browser-unsupported` | This format isn't supported by your browser. Try MP4 or PNG sequence. |
| `blur-unsupported` | This browser can't render the blur effect for export. |
| `cancelled` | Export cancelled. |
| `out-of-memory` | Ran out of memory — try a smaller size, fewer frames, or a shorter duration. |
| `invalid-options` | An export setting is out of range. (shows offending field from `fieldPaths`) |
| `audio-decode-failed` | Audio couldn't be decoded. (not reachable in v1 — no audio UI) |
| `font-decode-failed` | A font failed to load; can't export. |
| `font-not-ready` | Fonts aren't ready yet; try again in a moment. |
| `empty-frame-range` | This project has no frames to export. |
| `encoder-failure` | Encoding failed. Try again or pick another format. |
| `muxer-failure` | Writing the file failed. Try again or pick another format. |
| `project-invalid` | The project is invalid and can't be exported. |

The map is exhaustive by a `Record<ErrorCode, string>` keyed on the imported
union, so a change to `ErrorCode` fails to compile (property/unit guard).

### Save / load (`io/`)

- **Save**: `serializeProject(project)` → `Blob([json], { type: "application/json" })`
  → object-URL anchor download named `<project>.json`. The versioned
  `schemaVersion` is part of the serialized `Project` (Requirement 7.2). No
  network.
- **Load**: a hidden `<input type="file" accept="application/json,.json">`; on
  change, read the file text, call `parseProject(text)`. On a `ParseError`
  (invalid JSON, size-limit, or schema failure) show a specific message and leave
  the current project unchanged (Requirement 7.4). On success, replace the store's
  `Project` and reset `UiState` selection/playhead; panels re-render from the
  store (Requirement 7.5). The file is validated before any field is read
  (Requirement 11.4).

### CSP and security

- **No inline scripts.** Vite emits the entry as an external
  `<script type="module" src>` (no inlined script), so the CSP needs no
  `'unsafe-inline'` for scripts. The source `index.html` carries NO CSP meta; a
  build-only Vite plugin (`transformIndexHtml`, `apply: "build"`) injects the
  strict CSP meta into the EMITTED `index.html` only. The Vite DEV server runs
  with NO CSP (HMR needs inline styles + eval); the authoritative CSP check runs
  against `vite preview` of the production build (and the `vercel.json` header in
  prod). The one runtime `new Function("")` is Zod's guarded, caught `allowsEval`
  probe (see Deviations / Requirement 11.3), not app code.
- **Exact CSP** (served as an HTTP header in production and mirrored as a
  `<meta http-equiv>` for local static serving):

  ```
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: blob:;
  media-src 'self' blob:;
  font-src 'self';
  connect-src 'self' blob:;
  worker-src 'self' blob:;
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none'
  ```

  Notes: there is NO `'unsafe-inline'` for scripts or styles. `index.html` and
  any server-rendered string contain no inline `<script>`, no `<style>` element,
  and no `style="..."` attribute; no code path injects `style` or `script`
  markup. Dynamic styling is applied ONLY through the CSSOM — React's `style`
  prop (which writes to the element's `CSSStyleDeclaration`) and `setProperty` on
  CSS custom properties — which CSP allows without `'unsafe-inline'`. `blob:` is
  required for the worker (`@studio/exporters` builds its worker from a bundler
  URL) and for export output object-URLs. `connect-src 'self'` with no remote
  origins, combined with the no-network test, enforces "no runtime network"
  (`img-src`/`font-src` are `'self'` only — no CDN).
- The injected META omits `frame-ancestors` (browsers ignore it in a meta —
  header-only); `vercel.json` sets the FULL CSP (incl. `frame-ancestors 'none'`)
  as an HTTP header for production, which is where clickjacking protection
  applies. design/ is excluded from the build input entirely (see risks).
- **No `innerHTML` with user text**: all user text is rendered via React text
  children (auto-escaped) or canvas `fillText`; `errors.ts` strings are static.
- **`design/` not served/bundled**: `apps/studio` has its own Vite `root`; the
  repo-root `design/` is outside it and is never imported. A unit/build check
  greps the build output and the source import graph for `design/` and
  `support.js` and fails if referenced (Requirement 11.5).

### Performance measurement (Requirement 13)

- `playback/perf.ts` records `requestAnimationFrame` timestamps during a fixed
  play window and computes the mean and 95th-percentile inter-frame interval. It
  lives only in the shell (it reads the animation clock).
- **Method**: load the standard 1280×720 / 5-layer / one-effect-each fixture,
  play for 10 s, collect intervals. PASS when mean interval ≤ `1000/fps` ms
  (33.3 ms at 30 fps) and p95 ≤ 1.5× that (50 ms). The measured numbers are
  reported (not just pass/fail) so regressions are visible. Runs as a Playwright
  test on CI's headed Chromium (indicative) and is confirmed manually on a
  mid-range laptop.

## Correctness Properties

Each property runs >= 100 fast-check iterations and is tagged
`// Feature: studio, Property N: ...`.

### Property 1: Schema-preserving transitions

For any `ProjectSchema`-valid project and any action, `applyTransition` returns a
`ProjectSchema`-valid project OR returns the input unchanged (rejected), never an
invalid project.

**Validates: Requirements 3.7, 10.1, 10.3**

### Property 2: Time-pixel round-trip

For any `t in [0, durationSeconds]` and axis width, `xToTime(timeToX(t))` equals
`t` within one pixel, and vice-versa for integer x.

**Validates: Requirements 5.5**

### Property 3: Drag bounds

For any layer timing, drag kind, and delta, `drag.ts` output satisfies
`0 <= startSeconds < endSeconds <= durationSeconds`; `move` preserves
`endSeconds - startSeconds` exactly (clamped).

**Validates: Requirements 5.3, 5.4, 5.6**

### Property 4: Save/load round-trip

For any valid project, `parseProject(serializeProject(p))` deep-equals `p` (and
carries `schemaVersion`); no `UiState` leaks in.

**Validates: Requirements 7.1, 7.2, 10.5**

### Property 5: ErrorCode map total

Every `ErrorCode` value has a non-empty message (exhaustive `Record` + a runtime
iteration over `ERROR_CODES`).

**Validates: Requirements 8.6**

## Error Handling

All failures surface as typed values, never thrown exceptions crossing the UI:
model transitions reject invalid actions and return the unchanged project with
an inline `UiState` message; `io/load.ts` returns a `ParseError` mapped to a
specific message; exports return an `ExportResult` whose `ErrorCode` is mapped
by `export/errors.ts` (the exhaustive table above). The font gate maps load
failures to `font-not-ready` / `font-decode-failed`. No code path uses
`innerHTML` with user text.

## Testing Strategy

### Playwright test list (expected timings, bundled Chromium, localhost)

| Spec | What it asserts | ~time |
| --- | --- | --- |
| `preview.spec` | play advances, pause holds, loop wraps, scrub shows clamped frame, readout correct | ~3 s |
| `settings.spec` | presets + custom size, fps/duration bounds, transparent toggle + checkerboard, live update | ~2 s |
| `layers.spec` | add/edit/delete/reorder, draw-order follows order, font/size/colour/align/position edits | ~3 s |
| `effects.spec` | picker lists the 12 presets, apply seeds defaults, param edit updates live, remove | ~2 s |
| `timeline.spec` | bar maps start/width, playhead scrub, drag move/trim, keyboard nudge equivalents | ~3 s |
| `fonts.spec` | first frame waits for fonts; Tamil glyphs render; not-ready maps to error | ~2 s |
| `saveload.spec` | download round-trips; open valid replaces project; invalid shows error, no change | ~2 s |
| `export.spec` | dialog offers MP4/PNG/GIF only; capability gating; progress; cancel→cancelled; success download; mp4-no-transparency note; error mapping | ~6 s |
| `parity.spec` | preview frame vs exporter FrameRenderer frame within tolerance (Req 9) | ~3 s |
| `security.spec` | no network requests during a representative session; no design/ asset loaded | ~3 s |
| `csp.spec` | zero `securitypolicyviolation` events and no CSP console errors across a representative session (Req 11.2, 11.3) | ~3 s |
| `a11y.spec` | keyboard operability, labels present, visible focus, dialog focus-trap + Escape | ~3 s |
| `perf.spec` | 1280×720 / 5-layer playback frame-interval mean + p95 (reports numbers) | ~12 s |

All target < 10 s except `perf.spec` (a 10 s measurement window by design).

## Candidate dependencies beyond the approved list

None required. The design uses only `react`, `react-dom`, `@vitejs/plugin-react`,
`@types/react`, `@types/react-dom`, and the repo's existing tooling. Specifically
NOT proposed (and the chosen alternative):

- State management → a ~40-line `useSyncExternalStore` store, no library.
- Styling → plain CSS + design-token CSS variables, no CSS framework / CSS-in-JS.
- Icons → inline SVG in components, no icon package.
- Component testing → the pure model layer (Vitest/fast-check) + Playwright, no
  testing-library.

If any of these is later judged necessary, it will be proposed for approval
before installation (Requirement 14.4).

The approved packages' versions in the requirements table are indicative; the
actual exact versions are resolved from the npm registry at install time and
recorded in `docs/dependencies.md` (see risk 1).

## Deviations and risks

1. **Dependency versions are INDICATIVE** (the Approved-dependencies table shows
   current-stable values only). At the first task that touches `package.json`,
   each package is resolved with `npm view`, pinned to the exact latest stable
   mutually-compatible versions (`react`/`react-dom` identical; `@vitejs/plugin-react`
   compatible with the repo's Vite major; `@types` majors matching `react`), and
   its ACTUAL version/licence/publish date is recorded in `docs/dependencies.md`;
   any deviation from the table is reported.
2. **CSP: dev vs production, and one allowed probe.** No `'unsafe-inline'` for
   scripts or styles; dynamic styling is CSSOM-only. The strict CSP is injected
   into the BUILT `index.html` (build-only Vite plugin) and set as a `vercel.json`
   header; the DEV server runs with no CSP (HMR needs inline/eval). The `csp.spec`
   runs against `vite preview` of the production build and asserts ZERO
   violations EXCEPT exactly one named, caught probe: Zod `allowsEval`
   (`new Function("")`) → `script-src` / `eval`. Zod is required by the engine
   `ProjectSchema`; the probe is guarded + try/caught and falls back to the
   interpreted validator, so functionality is unaffected. `'unsafe-eval'` is NOT
   added; any other or second violation fails (Requirement 11.3).
3. **Excluding `design/` from the build**: because `apps/studio` has its own Vite
   root, the repo-root `design/` is naturally outside the build graph; the
   grep-based guard is a belt-and-suspenders check, not the primary mechanism.
4. **Perf budget on CI**: headless CI timing is indicative only; the authoritative
   Requirement 13 check is the reported numbers on a mid-range laptop (manual).
5. **Preview-without-React-per-frame**: driving canvas draws from the rAF clock
   outside React's cycle is deliberate; structural edits still flow through React.
   The risk (a stale snapshot) is handled by the clock reading the live store
   snapshot each frame rather than a captured closure.
6. **Worker + CSP `blob:`**: the exporter worker and object-URL downloads require
   `worker-src blob:` and `connect-src blob:`; these are scoped to `blob:` only,
   not remote origins, preserving the no-network guarantee.
7. **Exporters ambient types**: `@studio/exporters` ships `gifenc`'s ambient
   `declare module` in its own `src/types`, invisible to a consumer's tsconfig.
   `apps/studio/tsconfig.json` adds `../../packages/exporters/src/types/*.d.ts`
   to its `include` (studio-only; no exporters change, no shim copy) so importing
   the exporters barrel typechecks. The shipping shell stays exporters-free until
   Group 3.
