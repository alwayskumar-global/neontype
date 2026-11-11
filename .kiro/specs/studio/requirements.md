# Requirements Document

**Spec:** studio (the app)

## Introduction

`studio` is the browser-only, fully client-side motion-text editor app in
`apps/studio`. It lets a user build an engine `Project` — canvas settings, text
layers, per-layer preset effects, and a timeline — preview it live on a canvas
driven by the engine's pure render path, save/load the project as JSON, and
export it to MP4, a PNG sequence (ZIP), or GIF via `@studio/exporters`.

The app owns NO rendering, schema, or encoding logic: pixels come from
`@studio/engine` (`computeFrameState` / `drawFrame` / `renderFrame`), the project
data model is the engine's `Project` (validated by `ProjectSchema`), and all
export work goes through `@studio/exporters`. `studio` depends on
`@studio/engine` and `@studio/exporters` only, plus the tooling already present
in the repo (Vite, TypeScript strict, Vitest, Playwright, Zod, ESLint flat
config with the `Math.random` / `Date.now` / `performance.now` bans in `src`).

This document is the v1 requirements, in EARS form. Each requirement lists
numbered acceptance criteria and a verification method: **unit**, **property**,
**Playwright** (browser/visual), or **manual**. Terms: the *model* is the pure,
DOM-free state layer whose single source of truth is the `Project`; the *shell*
is the UI layer that holds the only playback clock.

### Architecture constraints (apply to every requirement)

- The project model is the single source of truth and is pure and deterministic:
  no `Math.random`, `Date.now`, or `performance.now` in model code (enforced by
  the ESLint bans in `src`). The playback/animation clock lives only in the UI
  shell.
- Exactly one `CanvasMetricsProvider` per canvas: the preview owns one; each
  export owns its own (created inside `@studio/exporters`). A text layout cache
  is never shared across providers.
- No runtime network requests, no backend, no accounts, no analytics/telemetry,
  no AI features, and no legacy product name or assets.
- `design/` is a visual reference only: its HTML/`support.js` must never be
  served, bundled, or copied; design tokens are reimplemented in `apps/studio`.
- CSP-compatible: no `eval`, no inline scripts, no `innerHTML` with user text.

## Glossary

- **Model:** the pure, DOM-free state layer whose single source of truth is the
  engine `Project`; all transitions are pure functions with no wall-clock read.
- **Shell:** the UI layer (DOM) that renders the model and holds the ONLY
  playback/animation clock.
- **Preview:** the on-screen canvas rendered via the engine render path.
- **Engine render path:** `computeFrameState` + `drawFrame` (composed by
  `renderFrame`) from `@studio/engine`; the single source of pixels.
- **presetCatalog:** the engine's machine-readable list of the 12 built-in
  effects with ids, display names, supported granularities, and default params.
- **CanvasMetricsProvider:** the engine's text-measurement provider bound to one
  canvas context; one per canvas, never sharing a layout cache.
- **Parity:** the property that the preview and an export produce the same frame
  for the same project and time.
- **ErrorCode:** the exporters' closed 12-value error union surfaced in the UI.
- **Hit box:** the axis-aligned canvas-pixel rectangle used to select and drag a
  layer on the canvas: the union of the boxes of the layer's visible glyph
  clusters, offset by the layer `anchor` and the layer transform
  `positionOffset` (see Requirement 3.8).
- **Visible glyph cluster:** a glyph cluster of the resolved engine `FrameState`
  that is not collapsible whitespace (space, tab, CR, LF).
- **Display scale:** the displayed canvas width in CSS px divided by the canvas
  pixel width.
- **Frame grid:** the set of times `k / fps` for whole `k`; every time the
  timeline writes to the `Project` lies on it.
- **History:** the linear, capped list of earlier `Project` states kept by the
  store for undo (see Requirement 16).
- **CSS custom property helper:** `ui/cssvars.ts` `setCssVars(el, vars)`, which
  applies dynamic positions and sizes through `el.style.setProperty`.

---

## Requirements

### Requirement 1: Canvas preview playback

**User Story:** As a creator, I want to play, pause, loop, and scrub my project
on a canvas, so that I can see the animation and inspect any moment.

#### Acceptance criteria

1. THE preview SHALL render frame `i` by calling the engine render path for the
   current `Project` at time `t = i / fps`, using a single
   `CanvasMetricsProvider` bound to the preview canvas. *(unit, Playwright)*
2. WHEN the user presses Play THE shell SHALL advance preview time from the
   current position and SHALL hold the project `fps` as the target frame rate.
   *(manual, Playwright)*
3. WHEN the user presses Pause THE shell SHALL stop advancing time and SHALL
   leave the displayed frame unchanged. *(Playwright)*
4. WHILE loop is enabled, WHEN playback reaches `durationSeconds` THE shell SHALL
   wrap to `t = 0` and continue. *(unit for wrap math, Playwright)*
5. WHEN the user scrubs to a position THE preview SHALL display the frame for the
   clamped time in `[0, durationSeconds]` without starting playback. *(Playwright)*
6. THE preview SHALL show a readout of the current frame index and time
   (seconds) and the total frame count `round(durationSeconds * fps)`. *(unit, Playwright)*
7. THE playback clock SHALL live only in the shell; the model SHALL expose no
   wall-clock read (verified by the ESLint purity bans over model `src`). *(unit)*
8. WHILE the OS "reduced motion" setting is active THE shell SHALL still play the
   preview normally (reduced-motion applies to UI chrome, not the preview). *(manual)*

### Requirement 2: Project settings

**User Story:** As a creator, I want to set the canvas size, fps, duration, and
background, so that my project matches my target.

#### Acceptance criteria

1. THE settings panel SHALL edit canvas `width`, `height`, `fps`,
   `durationSeconds`, and `background`, writing them into the `Project` model.
   *(unit, Playwright)*
2. THE width/height controls SHALL offer presets (e.g. 1920×1080, 1280×720,
   1080×1080, 1080×1920) and SHALL also accept custom integer values within the
   engine bounds (`width` 1–7680, `height` 1–4320). *(unit, Playwright)*
3. THE fps control SHALL accept values within the engine bound (1–120) and the
   duration control SHALL accept values within `0.1–600` seconds. *(unit)*
4. WHEN the user enters a value outside an engine bound THE shell SHALL reject or
   clamp it and SHALL show an inline validation message, and SHALL NOT write an
   invalid value into the model. *(unit, Playwright)*
5. THE background control SHALL set either a `#rrggbb` colour or the literal
   `transparent` via a transparent toggle, matching the engine `BackgroundSchema`.
   *(unit, Playwright)*
6. WHEN the background is `transparent` THE preview SHALL display a checkerboard
   (or equivalent) behind the frame so transparency is visible. *(Playwright)*
7. WHEN a setting changes THE preview SHALL update to reflect it without a reload.
   *(Playwright)*

### Requirement 3: Text layers

**User Story:** As a creator, I want to add, edit, delete, and reorder text
layers and control their type and placement, so that I can compose my title.

#### Acceptance criteria

1. THE user SHALL be able to add a text layer, which appends a schema-valid
   `TextLayer` to the `Project` with safe defaults. *(unit, Playwright)*
2. THE user SHALL be able to edit a layer's `text`, and the text SHALL be applied
   to the model and preview WITHOUT ever being injected as HTML (no `innerHTML`
   with user text). *(unit, Playwright)*
3. THE user SHALL be able to delete a layer, removing it from the model. *(unit, Playwright)*
4. THE user SHALL be able to reorder layers, and the order SHALL determine draw
   order in the preview and every export (same `Project.layers` order). *(unit, Playwright)*
5. THE user SHALL be able to edit per-layer `fontFamily`, `fontSize`,
   `fontWeight`, `fill` (colour), `align`, and `anchor` (position), each
   constrained to its engine schema bound. *(unit, Playwright)*
6. THE user SHALL be able to set a layer's start offset (`startSeconds`) and
   duration (deriving `endSeconds`), constrained so `0 <= startSeconds`,
   `endSeconds > startSeconds`, and `endSeconds <= canvas.durationSeconds`. *(unit, property, Playwright)*
7. WHEN any layer edit is made THE model SHALL remain `ProjectSchema`-valid, and
   an edit that would violate the schema SHALL be rejected with an inline message.
   *(unit, property)*
8. THE pure module `apps/studio/src/model/hit.ts` (no DOM, no clock, no
   randomness; Requirement 10 purity applies) SHALL compute the hit box of a
   layer as the layer `anchor`, plus the layer transform `positionOffset`, plus
   the union of the boxes of its visible glyph clusters taken from the resolved
   engine `FrameState`. Each cluster box SHALL span x from `layoutX` to
   `layoutX + width` and y from `layoutY - 0.8 * height` to
   `layoutY + 0.2 * height` (the `FrameState` carries only the full
   ascent-plus-descent height; 0.8/0.2 approximates Noto Sans and is held in
   the constant `ASCENT_RATIO = 0.8` in `hit.ts`, the descent share being
   `1 - ASCENT_RATIO`). Effect scale,
   rotation, blur, and per-segment effect position offsets SHALL be ignored so
   the box is stable while the text animates. A layer that is active but fully
   transparent at time `t` SHALL still have its layout box; a layer not active
   at `t` is not in the `FrameState` and SHALL NOT be selectable on the canvas;
   a layer with no visible cluster SHALL have no box. *(unit, property)*
9. WHEN the hit test runs THE `hit.ts` module SHALL test layers from the last in
   `Project.layers` to the first so the topmost painted layer wins, and SHALL pad
   each box by `8 / displayScale` canvas px on every side so the on-screen slop
   is 8 CSS px at any zoom. *(unit, property)*
10. THE `hit.ts` function `clientToCanvas` SHALL map viewport (client)
    coordinates to canvas pixel coordinates using the canvas element's bounding
    rect and the project canvas size, and SHALL return null for a rect of zero
    width or zero height. *(unit)*
11. WHEN the user clicks a layer's hit area on the canvas THE shell SHALL select
    that layer (the same selection as the Layers panel); WHEN the user clicks
    empty canvas THE shell SHALL leave the selection unchanged. *(Playwright)*
12. WHEN the user drags a selected or newly selected layer on the canvas THE
    shell SHALL edit ONLY the layer `anchor` through the existing set-anchor
    action: new anchor = start anchor + (pointer − start pointer) in canvas px,
    rounded to whole px (or to a multiple of an optional snap value, default 1),
    and clamped to `[0, canvas width] x [0, canvas height]`. *(unit, property,
    Playwright)*
13. WHILE Shift is held during a canvas drag THE shell SHALL keep only the
    dominant axis of the delta (the larger absolute component; a tie keeps x).
    *(unit)*
14. WHILE a canvas drag is in progress THE preview SHALL update live without
    committing to history on every pointermove; WHEN the pointer is released THE
    shell SHALL commit the project once; WHEN the pointer is cancelled THE shell
    SHALL restore the start anchor. WHEN a drag starts THE shell SHALL pause
    playback, and SHALL use pointer capture so the drag continues outside the
    canvas. *(Playwright)*
15. WHEN an Arrow key is pressed on the focused canvas AND a layer is selected
    THE shell SHALL move that layer's anchor by 1 px (10 px with Shift), clamped
    to the canvas, as one undo step per key press, and SHALL ignore all other
    keys. THE canvas SHALL be focusable (`tabindex` 0), SHALL have an accessible
    label, and SHALL show a visible focus style. *(unit, Playwright)*
16. WHILE a layer is selected THE shell SHALL draw an outline of that layer's hit
    box (without the pad) as an overlay element positioned with CSS custom
    properties (Requirement 11.2), not by painting into the canvas, so exports
    and the parity check (Requirement 9) are unaffected. THE shell SHALL set the
    cursor with a CSS class (`grab` over a hit layer, `grabbing` while
    dragging). *(Playwright)*
17. WHEN the project canvas width, height, or background changes (including after
    New or Open) THE preview component SHALL resize the canvas element's pixel
    size and update its transparent flag to match the current project.
    *(Playwright)*
18. THE layer editing in criteria 3.1–3.7 and all panels (Layers, Effects,
    Settings) SHALL keep working unchanged; canvas dragging and nudging SHALL be
    an additional way to edit `anchor`, and the `anchor` X/Y fields SHALL
    reflect the result. *(Playwright)*
19. THE hit-only metrics provider SHALL measure text with exactly the font
    string the painter sets on `ctx.font`, `${fontWeight} ${fontSize}px
    ${fontFamily}` (the string the engine `drawFrame` sets), and SHALL be
    rebuilt WHEN `document.fonts` fires `loadingdone`. *(unit)*
20. THE hit bounds SHALL agree with the drawn glyphs: a Playwright drift guard
    SHALL read the selection outline element (positioned from `layerBounds`)
    and compare it, in client px, with the pixel bounding box (ink) of the drawn
    `#ffcc00` title text, where `s` is the display scale and `fontSize` is in
    client px: (a) the outline CONTAINS the ink within 2 canvas px per edge
    (`eps = 2 * s`); (b) the left and right gaps (ink inside outline) are at
    most `0.2 * fontSize`; (c) the top and bottom gaps are at most
    `0.6 * fontSize`. A tolerance of 2 canvas px per edge on both sides is not
    possible, because the ink box is inset from the layout (advance and
    ascent/descent) box by glyph side bearings horizontally (about 0.1 em) and
    by the gap between cap height and the ascent/descent box vertically. The
    horizontal bound is loose enough to survive fallback-font metrics, which
    shift the width by roughly 10 percent. *(Playwright)*

### Requirement 4: Effect picker per layer

**User Story:** As a creator, I want to apply a preset effect to a layer and
tweak its parameters, so that the text animates the way I want.

#### Acceptance criteria

1. THE effect picker SHALL list exactly the effects in the engine `presetCatalog`
   (the 12 presets) by `id`/`displayName`, with no hardcoded effect list. *(unit)*
2. WHEN the user applies an effect to a layer THE shell SHALL add an
   `EffectInstance` with that `effectId`, a supported `granularity`, and the
   catalog `defaultParams`. *(unit, Playwright)*
3. THE picker SHALL expose each effect's documented params for editing, seeded
   from `defaultParams`, and SHALL offer only the `supportedGranularities` for
   that effect. *(unit, Playwright)*
4. WHEN an effect param changes THE preview SHALL update live to reflect it.
   *(Playwright)*
5. IF a param edit would fail the effect's schema THEN the shell SHALL reject it
   with an inline message and SHALL NOT write an invalid param into the model.
   *(unit, property)*
6. THE user SHALL be able to remove an effect from a layer. *(unit, Playwright)*

### Requirement 5: Timeline

**User Story:** As a creator, I want a timeline with a bar per layer and a
draggable playhead, so that I can arrange timing visually.

#### Acceptance criteria

1. THE pure module `apps/studio/src/model/timeline.ts` SHALL do all timeline math
   in whole frames: `frame = round-half-away-from-zero(seconds * fps)` and
   `seconds = frames / fps` rounded to 1e-6, so everything the timeline writes to
   the project lies on the frame grid. *(unit, property)*
2. THE function `dragTiming(kind, start, deltaFrames, fps, durationSeconds)` for
   `kind` in `move | start | end` SHALL behave as follows: `move` keeps the
   layer length in frames and clamps so `0 <= start` and `end <= duration`;
   `start` changes only the start, keeps at least 1 frame of length, and never
   passes the out-point; `end` changes only the end, keeps at least 1 frame, and
   never exceeds the duration. THE output SHALL always satisfy
   `0 <= start < end <= duration`, on the frame grid, with length of at least 1
   frame. *(unit, property)*
3. THE helpers `pxToSeconds` and `snapToFrame` SHALL convert a pointer position
   on the ruler to a frame-snapped time using the existing `timemap`, and SHALL
   NOT read a wall-clock; the time↔pixel mapping SHALL round-trip within one
   pixel. *(unit, property)*
4. THE timeline SHALL show a ruler spanning `[0, durationSeconds]` with
   `role="slider"`, and WHEN the user clicks or drags the ruler THE shell SHALL
   scrub the playhead to the frame-snapped time (same behaviour as Requirement
   1.5). THE timeline SHALL show a playhead at the current preview time.
   *(Playwright)*
5. THE timeline SHALL show one row per layer with a bar (move), a start handle,
   and an end handle (trim), whose positions map the layer `startSeconds` and
   `endSeconds` onto the time axis. *(unit for mapping, Playwright)*
6. WHILE the user drags a bar or handle THE shell SHALL update the layer live;
   WHEN the pointer is released THE shell SHALL commit exactly ONE
   `set-layer-timing` transition (one undo step); WHEN the pointer is cancelled
   THE shell SHALL restore the start timing. *(Playwright)*
7. WHEN a focused bar or handle receives ArrowLeft or ArrowRight THE shell SHALL
   move that part by 1 frame (10 frames with Shift), as one undo step per key
   press. *(unit, Playwright)*
8. THE bars and handles SHALL be focusable, SHALL have `role="slider"`, an
   `aria-label` naming the layer and the part (move / start / end), and
   `aria-valuenow`, `aria-valuemin`, `aria-valuemax` carrying their time in
   SECONDS, plus `aria-valuetext` with the time and unit. *(Playwright)*
9. THE layer start and duration numeric inputs in the Layers panel SHALL keep
   working and SHALL remain the non-pointer alternative (Requirement 12.6).
   *(Playwright)*
10. WHEN a timeline gesture or key press completes THE model SHALL remain
    `ProjectSchema`-valid. *(property)*
11. THE timeline SHALL apply bar, handle, playhead, and ruler positions and
    sizes through CSS custom properties (Requirement 11.2). *(Playwright)*

### Requirement 6: Bundled fonts and font readiness

**User Story:** As a creator, I want the app to use bundled fonts (including a
Tamil-capable one) that are ready before anything renders, so that preview and
export show correct glyphs.

#### Acceptance criteria

1. THE app SHALL bundle only open-licensed (OFL/CC0 or equivalent),
   self-hosted fonts; it SHALL make NO network font request at runtime. *(unit for
   manifest, manual for licences)*
2. THE bundled fonts SHALL include at least one family with Tamil coverage and at
   least one Latin family, selectable as a layer `fontFamily`. *(unit, Playwright)*
3. THE shell SHALL await `document.fonts.ready` (or explicit `FontFace` loads)
   BEFORE rendering the first preview frame. *(Playwright)*
4. THE shell SHALL confirm fonts are loaded BEFORE starting an export, and WHEN a
   font is not ready in time it SHALL surface the exporter `font-not-ready` error
   in the UI. *(unit for mapping, Playwright)*
5. IF a bundled font fails to decode THEN the shell SHALL surface the exporter
   `font-decode-failed` error in the UI and SHALL NOT start an export. *(unit for mapping)*

### Requirement 7: Save and load project JSON

**User Story:** As a creator, I want to download my project and open it later,
so that I can keep working across sessions.

#### Acceptance criteria

1. THE user SHALL be able to download the current project as a JSON file produced
   by the engine's canonical serializer (`serializeProject`). *(unit, Playwright)*
2. THE saved JSON SHALL carry the versioned `schemaVersion` field from the engine
   schema. *(unit)*
3. THE user SHALL be able to open a project JSON file from disk; the file SHALL be
   validated with the engine parser (`parseProject` / `ProjectSchema`) BEFORE it
   is used. *(unit, Playwright)*
4. IF the opened file is invalid JSON, exceeds the engine size limit, or fails
   schema validation THEN the shell SHALL show a clear, specific error and SHALL
   leave the current project unchanged. *(unit, Playwright)*
5. WHEN a valid file is opened THE model SHALL be replaced by the parsed
   `Project` and the preview and all panels SHALL reflect it. *(unit, Playwright)*
6. THE save/load path SHALL perform no network request; all I/O is local
   download / file input. *(unit, manual)*

### Requirement 8: Export dialog

**User Story:** As a creator, I want to export my project to MP4, a PNG sequence,
or GIF with per-format options, progress, and cancel, so that I can produce a
file to share.

#### Acceptance criteria

1. THE export dialog SHALL offer exactly MP4, PNG sequence (ZIP), and GIF; it
   SHALL NOT offer WebM-with-alpha or WebP. *(unit, Playwright)*
2. THE dialog SHALL call `detectCapabilities` and SHALL disable (with a reason) a
   format reported `unsupported`, enabling only `supported`/`unknown` formats.
   *(unit, Playwright)*
3. THE dialog SHALL expose the per-format options the exporter accepts (e.g. MP4
   `videoBitrate` and `backgroundFallback`; output size), seeded from the project.
   *(unit, Playwright)*
4. WHILE an export runs THE dialog SHALL show a progress bar driven by the
   exporter `onProgress` fraction. *(Playwright)*
5. WHEN the user cancels THE dialog SHALL abort via the `AbortSignal`, and the
   result SHALL be the `cancelled` error with no file produced. *(unit, Playwright)*
6. WHEN an export fails THE dialog SHALL display a human-readable message mapped
   from the closed `ErrorCode` set (all 12 values have a mapping), never a raw
   exception. *(unit, property)*
7. WHEN the export succeeds THE dialog SHALL offer the produced file for download
   using the exporter-provided `fileName`. *(Playwright)*
8. WHEN the project background is `transparent` AND the target is MP4 THE dialog
   SHALL show the `mp4-no-transparency` note (surfaced from the export summary).
   *(unit, Playwright)*
9. THE export SHALL run off the main thread when the exporter uses a worker, and
   the dialog SHALL remain responsive (cancel works) during the export. *(Playwright)*

### Requirement 9: Preview/export frame parity

**User Story:** As a creator, I want the exported file to look exactly like the
preview, so that what I see is what I get.

#### Acceptance criteria

1. THE preview and every export SHALL derive each frame from the SAME engine
   render path for the SAME `Project` and the SAME time `t = i / fps`; the studio
   SHALL NOT contain any alternate or duplicated render code. *(unit)*
2. FOR a given `Project` and frame index, the preview frame and the exported
   frame SHALL be visually identical within a small tolerance (accounting for
   container/codec encoding), verified by a parity check that renders the same
   frame both ways and compares composited output. *(Playwright)*
3. THE parity check SHALL use a dedicated `CanvasMetricsProvider` per canvas and
   SHALL NOT share a layout cache between the preview and the export. *(unit)*
4. WHERE blur is used, parity SHALL hold because both paths go through the
   exporter's deterministic blur wrapper (the studio never sets a browser
   `ctx.filter` blur for the final output itself). *(Playwright)*

### Requirement 10: Pure model / DOM separation and determinism

**User Story:** As a maintainer, I want a pure model layer separate from the DOM,
so that state is testable, deterministic, and the single source of truth.

#### Acceptance criteria

1. THE project model and all state transitions (add/edit/delete/reorder layer,
   set effect/param, settings edits, timeline moves) SHALL be pure functions over
   the `Project` with no DOM access and no wall-clock read; the new modules
   `model/hit.ts` and `model/timeline.ts` SHALL meet the same purity rule and
   the purity test of 10.4 SHALL cover them. *(unit, property)*
2. THE model SHALL be the single source of truth; UI panels SHALL derive from it
   and SHALL NOT hold competing copies of project state. *(unit)*
3. ANY model transition applied to a `ProjectSchema`-valid project SHALL yield a
   `ProjectSchema`-valid project, or SHALL be rejected without mutating the input.
   *(property)*
4. THE ESLint purity bans (`Math.random`, `Date.now`, `performance.now`) SHALL
   hold across the model `src`, guarded by a purity test. *(unit)*
5. THE model SHALL be serializable to and from the engine `Project` JSON with no
   studio-only fields leaking into the saved file. *(unit, property)*

### Requirement 11: Security

**User Story:** As a user, I want the app to be safe to run, so that opening a
file or typing text cannot execute code or leak data.

#### Acceptance criteria

1. THE app SHALL render all user text via DOM text nodes / canvas `fillText`,
   never via `innerHTML` or any HTML-injecting sink. *(unit, Playwright)*
2. THE app SHALL run under a strict CSP with NO `'unsafe-inline'` for scripts OR
   styles and no `eval`/`new Function`: `index.html` and any server-rendered
   string SHALL contain no inline `<script>`, no `<style>` element, and no
   `style="..."` attribute. Dynamic styling SHALL be applied only through the
   CSSOM (`setProperty` on CSS custom properties, which CSP permits); no code path SHALL inject `style` or `script` markup. Dynamic
   positions and sizes (selection outline, timeline bars, handles, playhead,
   ruler) SHALL be applied through the CSS custom property helper
   `ui/cssvars.ts` `setCssVars(el, vars)` (`el.style.setProperty`); JSX SHALL
   contain no `style` attribute or prop, and no inline `<style>` or
   `unsafe-inline` SHALL be added. *(unit for build check, Playwright, manual)*
3. THE app SHALL produce zero CSP violation reports during the Playwright run
   against the production build under the strict CSP, EXCEPT exactly one named,
   caught feature probe: Zod's `allowsEval` (`new Function("")`, guarded by
   jitless/Cloudflare checks and a try/catch), which surfaces as a `script-src`
   directive with blocked value `eval`. The canvas drag, nudge, and timeline
   features SHALL add ZERO new violations, and this single Zod probe is
   unchanged. The test asserts that single allowance by
   exact match (package: `zod`; directive: `script-src`; blocked: `eval`);
   `'unsafe-eval'` is NOT added. Any OTHER violation, or a second occurrence of
   anything (including a second eval probe), fails the test. Verified by
   listening for `securitypolicyviolation` events and non-eval CSP console errors
   across a representative session. The Vite dev server runs with no CSP meta
   (HMR needs inline/eval); the authoritative check runs against `vite preview` of
   the production build. *(Playwright)*
4. THE app SHALL make NO network request at runtime (verified by failing the test
   if any `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`/dynamic font/CDN
   request occurs during a representative session). *(Playwright)*
5. AN opened project file SHALL be validated (Requirement 7.3) before any field
   is read by the app. *(unit)*
6. THE `design/` directory SHALL NOT be served or bundled, and `support.js` SHALL
   NOT be imported; a build/config check SHALL fail if either is referenced.
   *(unit)*

### Requirement 12: Accessibility basics

**User Story:** As a keyboard or assistive-technology user, I want operable,
labelled controls with visible focus, so that I can use the studio.

#### Acceptance criteria

1. ALL interactive controls (buttons, inputs, sliders, the layer list, the effect
   picker, the export dialog) SHALL be operable by keyboard alone. *(Playwright, manual)*
2. ALL form inputs SHALL have programmatic labels (label element or
   `aria-label`). *(unit for static audit, Playwright)*
3. KEYBOARD focus SHALL be visible on every focusable control. *(Playwright, manual)*
4. THE export dialog SHALL trap focus while open, be dismissible with Escape, and
   return focus to the invoking control on close. *(Playwright)*
5. WHILE the OS reduced-motion setting is active THE app SHALL reduce non-essential
   UI chrome animation (transitions), WITHOUT altering the preview animation
   itself. *(manual, Playwright for the media-query wiring)*
6. THE timeline drag interactions SHALL have keyboard-accessible equivalents for
   moving and trimming a layer: the focusable slider bars and handles with
   Arrow-key stepping (Requirement 5.7, 5.8) and the numeric start/duration
   inputs (Requirement 5.9). THE canvas drag SHALL have the Arrow-key
   equivalent of Requirement 3.15. *(Playwright)*

### Requirement 13: Performance budget

**User Story:** As a creator on a typical laptop, I want smooth preview, so that
editing feels responsive.

#### Acceptance criteria

1. FOR a 1280×720 project with 5 text layers each carrying one effect, THE
   preview SHALL sustain the project `fps` (default target 30) during continuous
   playback on a mid-range laptop. *(Playwright/manual with stated method)*
2. THE measurement method SHALL be: play for a fixed window (e.g. 10 s) and record
   the mean and 95th-percentile frame interval from `requestAnimationFrame`
   timestamps in the shell; PASS WHEN the mean interval is at or below
   `1000 / fps` ms and the 95th percentile is within 1.5× of it. *(Playwright/manual)*
2a. THE frame-timing instrument SHALL live only in the shell (it reads the
   animation clock), never in the model. *(unit)*
3. WHEN the budget is not met THE result SHALL be reported as a measured number
   (not merely pass/fail) so regressions are visible. *(manual)*

### Requirement 14: Workspace, dependencies, and tooling

**User Story:** As a maintainer, I want the app to fit the monorepo's conventions
and use only the approved, exact-pinned dependencies, so that the build stays
clean and client-only.

#### Acceptance criteria

1. THE app SHALL live in `apps/studio` as a pnpm workspace member. Its RUNTIME
   dependencies SHALL be exactly `@studio/engine`, `@studio/exporters`, `react`,
   and `react-dom` (the repo steering mandates Vite + React). *(unit for manifest)*
2. THE app's DEV dependencies SHALL be the minimum for Vite + React + TypeScript
   — the Vite React plugin (`@vitejs/plugin-react`) and the React type packages
   (`@types/react`, `@types/react-dom`) — plus the tooling already present in the
   repo (Vite, TypeScript, Vitest, Playwright, Zod, ESLint, typescript-eslint).
   *(unit for manifest)*
3. EVERY added package SHALL be exact-pinned (no `^`/`~`), MIT or OSI-approved
   licensed, and SHALL have a row in `docs/dependencies.md` (name, exact version,
   license, reason). See the "Approved dependencies" section. *(unit for pins, manual for licences)*
4. THE app SHALL introduce NO UI component library, state-management library, CSS
   framework, router, icon package, or testing-library; component behaviour is
   verified through the pure model layer plus Playwright. ANY package beyond the
   approved list requires explicit owner approval and SHALL be proposed in
   `design.md` (not installed) first. *(unit for manifest, manual)*
5. THE app SHALL NOT change any `tsconfig` outside `apps/studio`. *(unit)*
6. THE build SHALL be fully static (no server code) and SHALL emit no runtime
   network dependency. *(unit, manual)*

### Requirement 15: Repository readiness

**User Story:** As a newcomer or evaluator, I want a complete root README, so
that I can understand, install, run, test, and build the project and know how it
was made.

#### Acceptance criteria

1. THE repository root SHALL have a `README.md` with a product summary (the
   browser-only, client-side motion-text studio) and no legacy product name or
   assets. *(manual)*
2. THE README SHALL list prerequisites with concrete versions (the required
   Node.js version and the pnpm version used by the repo). *(manual)*
3. THE README SHALL document the install, dev, test, and build commands
   (`pnpm install`; the dev command for `apps/studio`; `pnpm test`; the
   per-package Playwright commands; the build command). *(manual)*
4. THE README SHALL describe the workspace layout (`packages/engine`,
   `packages/exporters`, `apps/studio`, `docs/`, `.kiro/`). *(manual)*
5. THE README SHALL include a "Built with Kiro" section covering the specs,
   steering, hooks, and property-based testing used to build the project.
   *(manual)*
6. THE README SHALL include a third-party and disclosure section stating that
   planning and visual design were produced OUTSIDE Kiro (with Claude and Claude
   Design) while all CODE was written in Kiro, and SHALL link the dependency list
   to `docs/dependencies.md`. *(manual)*

### Requirement 16: Undo

**User Story:** As a creator, I want to undo my last change with Ctrl/Cmd+Z, so
that I can recover from a mistaken edit or drag.

#### Acceptance criteria

1. THE store SHALL keep a linear history of `Project` states (not UI state).
   Every accepted project change made through the store (panel edits, effect
   edits, canvas drags, nudges, timeline edits) SHALL be exactly one undo step;
   a rejected (schema-invalid or unchanged) action SHALL add none. *(unit, property)*
2. A drag or other pointer gesture SHALL be ONE undo step; the live frames during
   the gesture SHALL NOT be steps. *(unit, Playwright)*
3. THE history depth SHALL be capped at 100 steps, and WHEN the cap is exceeded
   THE store SHALL drop the oldest step. *(unit)*
4. WHEN the user presses Ctrl+Z (Cmd+Z on macOS) THE store SHALL restore the
   previous project state in one step. THE shortcut SHALL work WHILE focus is on
   the canvas, the timeline, or the page body, and SHALL NOT be intercepted WHILE
   focus is in a text input, number input, or textarea (the browser's own text
   undo applies there). *(Playwright)*
5. WHEN a file is opened, a New project is created, or the demo is loaded THE
   store SHALL replace the project and clear the history. *(unit)*
6. WHEN an undo is applied THE store SHALL restore the project only, keeping the
   selection and playhead where valid; IF the selected layer no longer exists
   THEN the store SHALL move the selection to the first layer, or to none when no
   layers remain. *(unit)*
7. THE history SHALL hold structurally shared immutable `Project` values (no deep
   copies) and SHALL add no dependency. *(unit)*
8. FOR ALL sequences of accepted actions, undoing every step SHALL return a
   project deep-equal to the original (undo-restores property). *(property)*
9. THE following SHALL hold in Playwright: dragging the title on the canvas
   changes its anchor (X/Y fields) and its on-canvas bounding box follows;
   Arrow-nudging the title by +1 px and +10 px (Shift) changes the anchor
   accordingly; dragging a timeline end handle changes the layer end to a time
   on a frame; Ctrl/Cmd+Z restores each of these changes in one step; and the
   Landing, export, and strict-CSP specs stay green. *(Playwright)*
10. WHEN Ctrl/Cmd+Z is pressed during an active gesture THE shell SHALL cancel
    the gesture first (restoring its start state) and the key press SHALL add
    no extra undo step. *(unit, Playwright)*
11. WHEN Escape is pressed or a pointercancel occurs during a drag THE shell
    SHALL cancel the gesture: the project returns to its start value and no
    undo step is added. *(unit, Playwright)*
12. WHEN an undo is applied THE shell SHALL clamp the playhead to the restored
    project's duration. *(unit)*
13. WHILE an export is running THE Ctrl/Cmd+Z shortcut SHALL do nothing (the
    export dialog owns focus). *(Playwright or unit)*
14. WHEN the history is empty THE undo SHALL be a no-op: no error and the same
    Project reference. *(unit)*
15. IF an action or gesture leaves the project unchanged (same reference, for
    example a no-op set-anchor or set-layer-timing), THEN THE store SHALL add no
    undo step. THE set-anchor and set-layer-timing transitions SHALL return the
    same Project reference WHEN nothing changed. *(unit)*
16. THE store SHALL NOT coalesce typing into one undo step; coalescing is out of
    scope. *(unit)*

---

## Out of scope (v1)

- Audio UI: the exporters support an AAC track, but studio v1 exposes no audio
  import or audio options in the export dialog.
- Redo (undo is covered by Requirement 16).
- Multi-select, rotate/scale handles, resizing text by dragging, canvas
  zoom/pan, and snapping to other layers.
- Lottie export; WebM-with-alpha export; animated WebP export.
- The `<motion-text>` embed web component (a separate later spec).
- Templates/presets gallery, sample-project library.
- Collaboration, sharing links, cloud storage, accounts — any backend or network
  feature.
- Dedicated mobile/touch layout (desktop layout only in v1).
- Keyframe-track editing UI (per-property keyframe curves) and keyframe editing
  generally, beyond effect params and layer timing.

---

## Approved dependencies

Runtime and dev dependencies for `apps/studio`, in the exporters-spec style:
exact-pinned, OSI-licensed, each with a `docs/dependencies.md` row. The versions
in the table below are INDICATIVE ONLY. At install time (the first task that
touches `package.json`) each package SHALL be resolved against the npm registry
with `npm view`, pinned to the exact latest stable version that is mutually
compatible (`react`/`react-dom` the same version; `@vitejs/plugin-react`
compatible with the repo's Vite major; `@types` majors matching `react`), and
its ACTUAL version, licence, and publish date SHALL be recorded in
`docs/dependencies.md`. Any deviation from this table SHALL be reported. No
package is installed during the requirements phase.

| Package | Type | Version | License | Reason |
| --- | --- | --- | --- | --- |
| `@studio/engine` | runtime | workspace:* | — (internal) | Pure render path + `Project` schema; the only source of pixels and the data model. |
| `@studio/exporters` | runtime | workspace:* | — (internal) | MP4 / PNG-sequence / GIF export and `detectCapabilities`. |
| `react` | runtime | 19.2.0 | MIT | UI framework mandated by repo steering (Vite + React). |
| `react-dom` | runtime | 19.2.0 | MIT | React DOM renderer for the app shell. |
| `@vitejs/plugin-react` | dev | 6.0.1 | MIT | Vite plugin for React (JSX/Fast Refresh); Vite 8 compatible. |
| `@types/react` | dev | 19.2.2 | MIT | React type definitions (strict TS). |
| `@types/react-dom` | dev | 19.2.1 | MIT | React DOM type definitions (strict TS). |

Tooling already present in the repo (Vite, TypeScript, Vitest, Playwright, Zod,
ESLint, typescript-eslint) is reused and not re-listed as new. No UI component
library, state library, CSS framework, router, icon package, or testing-library
is used; any candidate beyond this table is proposed in `design.md` for approval
before installation.

---

## Open questions

All five questions are RESOLVED; the owner accepted the recommended defaults.
They are recorded here as decisions.

1. **Default new-project settings.** *Resolved:* a fresh project is 1280×720,
   30 fps, 5 s, opaque `#101018`, with one starter text layer carrying the
   `fade-slide` effect.
2. **Bundled font set.** *Resolved:* reuse the engine's vendored families — Noto
   Sans (Latin) and Noto Sans Tamil — self-hosted as woff2, bundling weights 400
   and 700 for BOTH families (four woff2 files total), each with its OFL-1.1
   licence file.
3. **Effect granularity selection.** *Resolved:* default to the effect's first
   `supportedGranularity`, with an optional dropdown to change it among the
   effect's `supportedGranularities`.
4. **Preview resolution vs. canvas size.** *Resolved:* render at canvas pixel
   size into the backing store and fit-to-container via CSS transform, so preview
   pixels equal export pixels (preserving parity) regardless of on-screen size.
5. **Export output size default.** *Resolved:* default to the exact project
   canvas size (no scale), with optional common downscale presets that keep the
   aspect ratio within the exporter's 1-pixel rule.

---

## Verification method summary

- **unit** (Vitest, Node): pure model transitions, mapping/util functions,
  error-code→message mapping, manifest/config audits, schema round-trips.
- **property** (fast-check): model transitions preserve `ProjectSchema` validity;
  timeline time↔pixel mapping round-trips; layer-timing invariants hold. New
  properties (each >= 100 iterations, tagged
  `// Feature: studio, Property N: ...`, numbering continues after Property 5):
  - Property 6, drag identity (Req 3.12): `dragAnchor(start, start.pointer)`
    deep-equals `start.anchor` for an on-grid, in-canvas start anchor.
  - Property 7, drag stays in canvas (Req 3.12, 3.13): for any start, pointer,
    shift, snap, and canvas size, the output anchor is inside `[0,w] x [0,h]` and
    on the whole-pixel/snap grid.
  - Property 8, timing drag stays on the frame grid (Req 5.1, 5.2, 5.10): for any
    kind, start timing, delta, fps, and duration, `dragTiming` output is on the
    frame grid, inside `[0, duration]`, with length >= 1 frame; `move` preserves
    the length in frames.
  - Property 9, undo restores (Req 16.1, 16.2, 16.8): for any sequence of
    accepted actions, undoing them all returns the original project (deep-equal);
    one gesture is one step.
  - Existing Property 3 (Drag bounds) is updated to refer to the frame-grid
    version, Property 8 (Req 5.2, 5.10).
- **Playwright** (bundled Chromium, localhost): preview playback/scrub, settings,
  layer and effect editing, timeline drags, font readiness, save/load, the export
  dialog end-to-end, preview/export parity, no-network session, and accessibility
  (keyboard, focus, dialog focus trap).
- **manual**: font licensing, reduced-motion feel, CSP in a real browser, and the
  performance budget number on a mid-range laptop.
