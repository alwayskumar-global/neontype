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
- One display `CanvasMetricsProvider` per canvas (owned by the exporter
  `FrameRenderer` that paints the preview) plus one hit-only provider that
  `PreviewCanvas` creates for selection boxes; each export owns its own (created
  inside `@studio/exporters`). A text layout cache is never shared across providers.
- No runtime network requests, no backend, no accounts, no analytics/telemetry,
  no AI features, and no legacy product name or assets.
- `design/` is a visual reference only: its HTML/`support.js` must never be
  served, bundled, or copied; design tokens are reimplemented in `apps/studio`.
- CSP-compatible: no `eval`, no inline scripts, no `innerHTML` with user text.
- The converter output folder `apps/studio/src/generated/` and the design-system
  port `apps/studio/src/ds/` (Requirements 17 and 18) obey the same CSP and
  purity rules as the rest of `apps/studio/src`.

### Deviations (approved by the owner)
These three points conflict with workspace steering or an earlier instruction. They
were flagged, not resolved silently, and are now approved by the owner.

1. **Tokens rule.** The workspace design rule says to extract design tokens into
   a single tokens file and to hard-code no values in components. Generated CSS
   (Requirement 17) carries the design's literal values, and `ds/ds.css`
   (Requirement 18) is a second token sheet, scoped under `.ds-root`. This spec
   accepts that for `generated/` and `ds/` only. The steering exception ("no
   hard-coded values in components", single tokens file) covers
   `apps/studio/src/generated/` and `apps/studio/src/ds/` ONLY, and
   `apps/studio/src/tokens.css` is untouched. *Approved by the owner.*
2. **Dynamic style mapping.** The requested mapping "dynamic `style` to a React
   style object" is replaced by scoped CSS classes that read CSS custom
   properties, set through `ui/cssvars.ts` `setCssVars` from a ref (a callback ref
   per element; inside `<sc-for>` each list item sets its own variables). This
   keeps Requirement 11.2 (no JSX `style` attribute or prop) and the ESLint style
   guard intact. *Approved by the owner.*
3. **Per-file converter config rules.** The real design files need three rules in
   `dc-convert.config.json`, with these outcomes: Landing Page: every
   `href="Studio Editor.dc.html"` (4 occurrences) is rewritten to
   `href="#studio"` and the anchor also gets an optional `onOpenStudio` handler
   from the data (`data.onOpenStudio`, a function, optional; no routing this
   round); Export Flow: the "Review bar" element is omitted because its source
   text says it is not product UI; Error States: `style="{{ w.iconStyle }}"` is
   rewritten to a class per variant (a `data-variant` attribute set from the data,
   plus CSS rules per variant in the screen's scoped CSS). No object-valued style
   remains in the output. The converter also relies on the helper
   `src/ds/helpers.ts`. *Approved by the owner.*

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
- **dc.html:** a design-export screen file in `design/` named `*.dc.html`: an
  `<x-dc>` document with a `<helmet>` block, markup using `{{ }}` bindings and
  directives (`sc-if`, `sc-for`, `x-import`, `dc-import`, `ref`, `dc-props`),
  and a `text/x-dc` data script. It is converter INPUT only.
- **DS bundle:** the design-system export in `design/_ds/` (export id
  `f5b901ae-a7fb-489e-9b53-af9bc496124b`, global namespace
  `MotionTextStudioDesignSystem_f5b901`): CSS, tokens, fonts, and
  `_ds_bundle.js`. It is a reference for the hand-copied `ds/` port and is never
  loaded or imported.
- **Scoped class:** a CSS class generated by the converter, named from a stable
  hash of its declaration text, and emitted as `.dc-<slug> .cls` under the
  per-screen root class `.dc-<slug>`. Helmet rules are prefixed with
  `:where(.dc-<slug>)` so they add no specificity.
- **Generated output:** the committed files under
  `apps/studio/src/generated/<slug>/` (`<PascalName>.tsx`, `<slug>.css`,
  `assets/`) written by the converter.
- **Backdrop slot:** the place in a generated component where a `dc-import`
  appeared. The component renders its optional `backdrop` prop there; the caller
  passes the other generated screen.

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

1. THE export dialog SHALL offer exactly MP4, PNG sequence (ZIP), GIF, and animated
   WebP; WebP is gated on the exporters capability result like the others (disabled
   with its reason when unsupported). It SHALL NOT offer WebM-with-alpha (deferred by
   owner decision). *(unit, Playwright)*
2. THE dialog SHALL call `detectCapabilities` and SHALL disable (with a reason) a
   format reported `unsupported`, enabling only `supported`/`unknown` formats.
   *(unit, Playwright)*
3. THE dialog SHALL expose, per export, the format and the output size (0.5x, 1x or
   2x of the project, same aspect), seeded from the project. THE MP4 `videoBitrate`
   SHALL be fixed at 8 Mbit/s and SHALL NOT be shown. *(unit, Playwright)*
   *Revised in Group 10 (design revision): the revised Export Flow has no bitrate control and offers sizes as scales of the project.*
4. WHILE an export runs THE dialog SHALL show a progress bar driven by the
   exporter `onProgress` fraction. *(Playwright)*
5. WHEN the user cancels THE dialog SHALL abort via the `AbortSignal`, and the
   result SHALL be the `cancelled` error with no file produced. *(unit, Playwright)*
6. WHEN an export fails THE dialog SHALL display a human-readable message mapped
   from the closed `ErrorCode` set (all 12 values have a mapping), never a raw
   exception. *(unit, property)*
7. WHEN the export succeeds THE dialog SHALL offer the produced file for download
   using the exporter-provided `fileName`. *(Playwright)*
8. WHEN the project background is `transparent` AND the chosen format cannot carry
   alpha (`supportsAlpha(format)` is false; MP4 only) THE dialog SHALL show a
   no-transparency note on the Options step before export ("... the background will
   be black.") and on the Done step after it ("Exported without transparency."). THE
   note SHALL be derived from `supportsAlpha(format)` and the project background, not
   from the export summary, and SHALL NOT show for a format that keeps alpha (PNG
   sequence, GIF, WebP). *(unit, Playwright)*
   *Revised in Group 10 (design revision): the revised Export Flow shows the note itself on two steps, so the adapter derives it from the format and the project.*
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
   copies) and SHALL add no dependency. WHEN an action is accepted THE reducer
   SHALL keep untouched layers and the canvas by reference. *(unit)*
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
    example set-text with an unchanged value), THEN THE store SHALL add no undo
    step. EVERY action's transition SHALL return the same Project reference WHEN
    its result equals the input. *(unit, property)*
16. THE store SHALL NOT coalesce typing into one undo step; coalescing is out of
    scope. *(unit)*

### Requirement 17: Design-source converter

**User Story:** As a maintainer, I want a deterministic converter from the
`design/` screen exports to typed React components, so that the designed screens
exist as CSP-safe source in `apps/studio` without ever shipping the export.

The converter is `apps/studio/scripts/dc-convert-lib.mjs` (pure function),
`apps/studio/scripts/dc-convert.mjs` (CLI), and
`apps/studio/scripts/dc-convert.config.json`, run by the npm script
`dc:convert`. It reads the five `design/*.dc.html` files (Studio Editor, Effects
Library, Export Flow, Error States, Landing Page) as input only.

#### Acceptance criteria

1. THE converter SHALL run on Node >= 20 using only built-ins (`node:fs`,
   `node:path`, `node:crypto`), with its own small strict HTML tokenizer and tree
   builder, and SHALL add NO dependency (Requirement 14). IF the input contains an
   unknown tag, directive, attribute, or `{{ }}` expression form THEN THE
   converter SHALL fail the build with a non-zero exit code and a message naming
   the file and line, and SHALL NOT guess. *(unit)*
2. THE converter SHALL be deterministic: identical input SHALL yield
   byte-identical output (stable file order, LF newlines, no timestamps, absolute
   paths, or random values). Class names SHALL derive from a stable hash of the
   declaration text. THE header comment of each generated file SHALL name the
   source file and the sha256 of its bytes. *(unit)*
3. THE converter SHALL map the input as follows. *(unit)*
   1. A static `style="..."` SHALL become a scoped class in the generated CSS;
      identical declaration text SHALL share one class.
   2. A dynamic `style` (containing `{{ }}`) SHALL NOT become a React style
      object, because Requirement 11.2 forbids any JSX `style` attribute or prop.
      Each dynamic declaration SHALL become a scoped class rule reading a CSS
      custom property (`prop: var(--dc-...)`), and the element SHALL set that
      custom property from the bound value through `ui/cssvars.ts` `setCssVars`
      from a CALLBACK ref on that element. Inside `<sc-for>` the callback ref is
      created per list item, so each item sets its own custom properties
      (owner-approved, Deviation 2).
   3. `style-hover`, `style-focus`, and `style-active` SHALL become scoped
      `:hover`, `:focus`, and `:active` rules in the generated CSS.
   4. `{{ path }}` (a dotted path, a numeric/boolean/null literal, or `$index`)
      SHALL become a lookup into the component data scope or the loop-variable
      scope.
   5. `<sc-if value>` SHALL become conditional rendering; `<sc-for list as>`
      SHALL become a list map keyed by index with `$index` available.
   6. `<x-import component-from-global-scope=NS.Name ...>` SHALL become the ported
      DS component `Name` (Requirement 18) with props camelCased, `hint-*`
      dropped, and children preserved. Any namespace other than
      `MotionTextStudioDesignSystem_f5b901` SHALL be a build error.
   7. `<helmet>` SHALL contribute its `<style>` content as the scoped CSS; its
      `<title>`, `<meta>`, and `<link>` SHALL be dropped.
   8. HTML attributes SHALL be renamed to their React forms (`class` to
      `className`, `for` to `htmlFor`, `tabindex` to `tabIndex`, SVG attributes
      such as `stroke-width` to `strokeWidth`, `viewBox` kept); event attributes
      (`onClick`, `onChange`, `onKeyDown`, `onPointerDown`, `onMouseEnter`,
      `onMouseLeave`, `onFocus`, `onBlur`) SHALL bind to function values.
   9. `<dc-import name=...>` SHALL become a backdrop slot: the generated component
      renders its optional `backdrop` prop in that place.
   10. The `support.js` `<script>`, every `<script type="text/x-dc">` data
       script, and the second `<script src=.../_ds_bundle.js>` found inside
       `<helmet>` of the four non-editor files SHALL be dropped: never executed,
       embedded, or imported.
   11. `ref="{{ ... }}"` SHALL bind to a function value in the data scope and
       become a React `ref`; `dc-props` SHALL be dropped; a static `style` on an
       `x-import` element SHALL become a `className` on the ported component.
   12. Data values MAY be React elements and refs, in addition to strings,
       numbers, booleans, null, arrays, objects, and functions.
   13. An object-valued style binding (for example
       `style="{{ w.iconStyle }}"`) is NOT convertible and SHALL be handled by a
       per-file config rule (criterion 4), not guessed.
   14. EACH generated module SHALL also export a `<NAME>_KEYFRAMES` map for the
       helmet keyframes that data references by name.
4. THE converter SHALL read per-file rules from
   `apps/studio/scripts/dc-convert.config.json`: `omitIf` (omit an element
   matching a selector or condition), `replaceText` (exact text replacements,
   for example legacy wording), and `forbid` (patterns that fail the build when
   found in a file's output; at minimum the legacy product name `Flash` and
   remote URLs). The real files need three owner-approved rules (Deviation 3):
   1. Landing Page: every `href="Studio Editor.dc.html"` (4 occurrences) SHALL be
      rewritten to `href="#studio"`, and the anchor SHALL also receive an optional
      `onOpenStudio` handler bound to `data.onOpenStudio` (a function; absent
      means no handler; no routing this round).
   2. Export Flow: the element with `data-screen-label="Review bar"` SHALL be
      omitted.
   3. Error States: `style="{{ w.iconStyle }}"` SHALL be rewritten to a class per
      variant: a `data-variant` attribute set from the data, plus CSS rules per
      variant in the screen's scoped CSS. THE output SHALL contain no
      object-valued style anywhere (criterion 3.13). *(unit)*
5. THE converter SHALL scope CSS under a per-screen root class `.dc-<slug>`
   (slug = kebab-case of the file name): `html`, `body`, and `:root` selectors
   SHALL become that root; helmet rules SHALL be prefixed with
   `:where(.dc-<slug>)` (zero added specificity); converted style classes SHALL
   be emitted as `.dc-<slug> .cls`; THE scoper SHALL fail the build on a helmet
   selector whose specificity would be (0,2,0) or more, so converted inline
   styles keep the cascade position they had; `@keyframes` names SHALL be
   prefixed with the slug; `@media` and container rules SHALL be kept, and
   `@container` / `container-type` semantics SHALL be preserved. *(unit)*
6. THE generated output SHALL contain no `style="..."` string, no JSX `style`
   attribute or prop, no `dangerouslySetInnerHTML`, no `<script>` element, no
   inline `<style>` element, no `http(s)` URL, and no import path containing
   `design/`. THE converter SHALL rewrite each `<img src>` to a bundled-asset
   import from the local `assets/` folder and SHALL copy the referenced asset
   files byte-for-byte into the output folder. Nothing at runtime or build time
   SHALL import from `design/`; the converter reads `design/` only as input.
   *(unit)*
7. THE converter SHALL write `apps/studio/src/generated/<slug>/<PascalName>.tsx`
   (typed props: `data` and optional `backdrop`; strict TypeScript, no `any`, no
   `ts-ignore`), `<slug>.css`, and `assets/`, and `generated/` SHALL be
   committed. Each generated component SHALL be a pure render function of its
   props and SHALL read no DOM, clock, or randomness at render time. *(unit)*
8. THE converter SHALL generate all five screens in this round. Wiring any
   generated screen into the live studio UI (routes, state, replacing existing
   panels) is out of scope and requires its own spec amendment. *(manual)*
9. THE unit tests (Vitest in Node, no new dependency) SHALL do all file reads
   through `scripts/dc-io.mjs`, typed by the hand-written
   `dc-convert-lib.d.mts` and `dc-io.d.mts` (because `apps/studio` has no
   `@types/node`), and SHALL cover: *(unit)*
   1. determinism: converting every `.dc.html` twice yields byte-identical
      output;
   2. staleness: regenerating into a temp directory equals the committed
      `generated/` folder, including copied assets;
   3. a static audit of `generated/` and `ds/`: no `style="`, no
      `dangerouslySetInnerHTML`, no `<script`, no import path containing
      `design/`, no JSX `style` attribute;
   4. fail-loud behaviour on small synthetic inputs: unknown directive, operator
      inside `{{ }}`, unknown `x-import` namespace, forbidden text;
   5. `tsc` compiles `generated/*.tsx`;
   6. ESLint passes on `generated/` and `ds/`.
10. THE repository SHALL provide a dev-only smoke harness that is NOT a
    production route: one Vite config building two pages into its own output
    folder (not `dist/`), served under the same strict CSP injected the same way
    as the production build. The harness SHALL have TWO pages:
    1. `index.html` mounts the generated Studio Editor with a static fixture for
       its data and imports no engine code. A Playwright spec SHALL assert that
       it renders its landmarks and emits ZERO `securitypolicyviolation` events
       (not even the Zod probe of Requirement 11.3, because no engine code is
       imported).
    2. `parity.html` loads `ds.css` and exposes the export parity probe over the
       demo project. Because the probe imports the engine, which imports Zod, at
       most the one allowed Zod `allowsEval` probe violation is tolerated there
       (the same assertion as `tests-csp`). With `ds.css` loaded,
       `window.__studioExportParity(t)` SHALL be exactly 0 for t = 1, 3, and 5.5.
    The live app entry SHALL NOT import `ds.css` until generated screens are
    wired in; a production-build test SHALL assert that the default-route CSS
    contains no `.ui-` and no `.ds-root` selector. Importing `ds.css` into the
    live app is a task for the future "wire generated screens" spec.
    A unit test SHALL build the production app in memory with Vite
    `build({ write: false })` and scan the output paths and text for the
    patterns `design/` (word-boundary guarded), `_ds/`, `_ds_bundle`,
    `support.js`, `.dc.html`, and `MotionTextStudioDesignSystem`, and SHALL fail
    if any is found; the
    production `dist/` SHALL contain no file from `design/`. *(Playwright, unit)*

### Requirement 18: Design-system port

**User Story:** As a maintainer, I want the 12 design-system components the
mockups use ported by hand into `apps/studio/src/ds/`, so that generated screens
have accessible, CSP-safe building blocks that do not restyle the live studio.

#### Acceptance criteria

1. THE file `apps/studio/src/ds/ds.css` SHALL be hand-copied from the export's
   `tokens/*.css` and `components/ui.css`, with a header comment naming the
   source export id (`f5b901ae-a7fb-489e-9b53-af9bc496124b`) and the bundle
   namespace, and SHALL NOT be imported from `design/`. Token declarations SHALL
   be scoped under `.ds-root` (not `:root`) so that the 44 token names shared
   with `apps/studio/src/tokens.css` cannot collide (measured: 16 of the 44
   differ; 10 differ only in text form and 6 differ in value, for example
   `--radius-lg` and `--radius-md`).
   `ds.css` SHALL contain no `url()` other than the `@font-face` sources of
   criterion 2, and SHALL keep the `prefers-reduced-motion` block. *(unit)*
2. THE fonts Instrument Sans (latin and latin-ext woff2) and DM Mono (400 and
   500, latin and latin-ext woff2) SHALL be copied into
   `apps/studio/src/ds/fonts` (NOT `public/`) together with their SIL OFL 1.1 license texts, and
   the `@font-face` rules in `ds.css` SHALL point at `./fonts/...`, so that Vite emits the
   files only for builds that import `ds.css`. A unit test SHALL assert that the default-route
   production dist, as written, contains no DMMono or InstrumentSans file and that the harness
   dist does. Noto Sans Tamil
   SHALL NOT be copied; `--font-tamil` SHALL resolve to the studio's own declared
   `Noto Sans Tamil`. THE license texts SHALL be taken from the upstream
   `google/fonts` repository (`ofl/instrumentsans/OFL.txt` and
   `ofl/dmmono/OFL.txt`; web lookup is read-only and owner-approved), and
   `apps/studio/src/ds/fonts/README.md` SHALL record the source URL and the
   commit or date of each. IF either text cannot be verified THEN the implementer
   SHALL STOP and ask the owner and SHALL NOT invent a copyright line. EACH font family SHALL have a `docs/dependencies.md` row (name, license,
   source, reason). THE app SHALL make no network request for these fonts at
   runtime. *(unit for manifest and paths, manual for licences)*
3. THE file `apps/studio/src/ds/index.tsx` SHALL port ONLY the 12 components the
   mockups use: Button, Chip, CodeBlock, Icon, IconButton, NumberScrub,
   ProgressBar, SegmentedControl, Select, Slider, Toast, and Toggle. Markup and
   `ui-*` class names SHALL match `_ds_bundle.js`, which is read as a reference
   and never loaded or imported. Each component SHALL render its `ui-*` root
   class, SHALL give every control an accessible name (label or `aria-label`),
   SHALL show a visible keyboard focus, and SHALL respect
   `prefers-reduced-motion`. Icon paths SHALL be ported from `ICONS` in the
   bundle for ONLY the icons the mockups reference plus the three the ported
   components use internally (check, minus, chevron-down), 27 in total. The
   mockup references are the static `name=` / `icon=` names (chevron-left,
   chevron-right, close, code, copy, download, effect, error, export, eye, image, info, lock,
   play, plus, redo, search, success, text, trash, warning) and the `icon:`
   literals in the data scripts (clock, code, error, grid, image, layers, play,
   warning). `viewport` is a `<meta name>`, not an icon, and SHALL NOT be
   ported. Bundle code that uses `dangerouslySetInnerHTML` (Icon, CodeBlock) or
   React style objects (ProgressBar, Slider, NumberScrub, Select) SHALL NOT be
   ported verbatim: icons SHALL be typed shape data rendered as React SVG
   children; CodeBlock text SHALL be tokenized into spans; dynamic values SHALL
   go through CSS custom properties set with `setCssVars`. A unit test SHALL
   assert that every referenced icon name exists in the port. *(unit)*
4. THE module `apps/studio/src/ds/dc-runtime.ts` SHALL provide what generated
   code needs: the data/scope value type, a safe path lookup (`a.b.c` over
   objects and arrays, returning `undefined` for a missing segment), and a typed
   ref-callback helper that applies custom properties through `setCssVars`. It
   SHALL contain no `any` and no `eval`. *(unit)*
5. THE tests SHALL cover: each ported component rendering its `ui-*` root class
   via `react-dom/server` `renderToStaticMarkup` (`react-dom` is already a
   dependency; IF `renderToStaticMarkup` is unavailable THEN the implementer
   SHALL STOP and report); keyboard and ARIA basics asserted on the markup
   (accessible names, roles, `aria-pressed`, `aria-checked`, `aria-valuenow`
   where applicable); the icon coverage test of criterion 3; and a static audit
   of `ds/` (no `style=`, no import path containing `design/`). *(unit)*
6. THE port SHALL NOT change the dependency list of Requirement 14: no new
   runtime or dev dependency. *(unit for manifest)*
7. THE file `ds.css` SHALL NOT port the design system's `Noto Sans Tamil`
   `@font-face`: the studio already declares that family in
   `apps/studio/src/fonts/fonts.css`, and a second declaration with different
   files would change which glyphs the canvas and exports use and break export
   parity. Generated and DS UI SHALL use the studio's existing Noto faces.
   *(unit)*
8. THE `@font-face` rules ported into `ds.css` SHALL keep `url()` sources only;
   `ds.css` SHALL contain no `local(`, so that a user-installed copy never
   replaces the bundled file. *(unit)*
9. THE file `ds.css` SHALL declare `@font-face` ONLY for families that the studio
   does not already declare (Instrument Sans and DM Mono). A unit test SHALL parse
   `ds.css` and `apps/studio/src/fonts/fonts.css` and assert that the two sets of
   declared family names are disjoint, and that `ds.css` has no `local(`.
   *(unit)*
10. WHEN `ds.css` is loaded, THE export parity probe `window.__studioExportParity(t)`
    SHALL return exactly 0 for t = 1, 3, and 5.5 in the smoke-harness `parity.html`
    build (Requirement 17.10), which loads `ds.css`. THE default studio route SHALL
    NOT load `ds.css`, and its parity at those times stays exactly 0 without it.
    *(Playwright)*

### Requirement 19: Generated-screen wiring
**User Story:** As the owner, I want the live studio to render the screens I
designed, driven by pure adapters over the existing store, so that users see my
design while rendering, export, and schema logic stay where they are today.
#### Acceptance criteria
1. THE screen-to-route map SHALL be the one below. A route marked WIRE SHALL render
   its generated screen. A route marked DEFERRED SHALL keep its existing
   hand-written component until the owner promotes it by an explicit decision
   recorded in this requirement. *(review, then Playwright per route)*

   | Live route | Generated screen | Decision | Why |
   | --- | --- | --- | --- |
   | Editor | Studio Editor | WIRE (task 10.3) | 71 bindings, all backed, 0 inert; the live canvas and timeline are hosted in its two slots |
   | Export dialog | Export Flow | WIRE (task 10.4) | 39 bindings, all backed, 0 inert. Owner decision: Frame rate and Duration are read-only displays and the export step SHALL NOT edit the project |
   | Preset picker | Effects Library | WIRE (task 10.5) | 54 bindings, all backed, 0 inert; uses a studio-side category table and a param-range table (design gaps D-5, D-6) |
   | Landing | Landing Page | DEFERRED (owner decision: not wired) | its copy and tiles claim Web embed, WebM alpha, and "Works offline", none of which ship; `tests/landing.spec.ts` asserts those words are absent; its hero and gallery are CSS approximations while the live landing draws with the real renderer |
   | Error and empty states | Error States | DEFERRED (owner decision: not wired) | all 8 bindings are inert: no warnings surface exists in the store or UI, and the offline toast would assert an offline mode the app does not have |
   *Revised in Group 10 (design revision): the table now states what was built (the earlier rows described the screens before the owner's revised designs).*
2. THE app SHALL contain exactly one pure adapter per wired screen at
   `apps/studio/src/wiring/<slug>.ts`, with the signature
   `(state, dispatchers) => DcProps`. THE adapter's data keys SHALL equal that
   screen's exported `*_BINDINGS` list exactly, with no missing and no extra key.
   THE adapter SHALL read only store state, `presetCatalog`, the export error map,
   the selectors in `model/selectors.ts`, and the engine's `builtinRegistry`
   (read-only, through `paramKinds` and `paramEditIssue`, for param kinds and schema
   validation). IT SHALL NOT call `computeFrameState`,
   `renderFrame`, or any exporter; call any engine function that mutates state; read
   the DOM, a clock, or a random source; or use a React hook. *(unit, property)*
   *Revised in Group 10 (design revision): typed effect params are validated against the effect's own schema, which needs the engine registry read-only; the purity walk still enforces the rest.*
3. EVERY binding SHALL be classified in the design as an action (A), selector (S),
   constant (C), host view state (V), or inert in v1 (I), with its source or reason.
   EVERY handler binding SHALL either call one documented store action, gesture
   API call, clock method, export-pipeline call, or host setter, or be listed as
   inert in v1 with a reason. AN inert control SHALL be unreachable: hidden through
   the screen's own visibility binding, omitted from a data list, or the screen is
   gated by criterion 9. THE adapter SHALL NOT show a number or text it cannot
   derive (no fabricated sizes, ETAs, names, or opacity values). *(unit)*
4. THE preview canvas, the playback clock, the timeline interaction, and the export
   pipeline SHALL be unchanged; a generated screen only hosts them through a slot
   (a node binding) or a ref. THE host SHALL NOT call `computeFrameState` or
   `renderFrame` outside `preview/` and the exporters. WHEN a screen is wired,
   `window.__studioExportParity(t)` SHALL return exactly 0 at t = 1, 3, and 5.5 on
   the default route (dev build). *(Playwright)*
5. THE app entry `main.tsx` SHALL import `./ds/ds.css`. THE `dist-scan` assertions
   of Requirement 18.10 SHALL be inverted: the default-route production dist SHALL
   contain the `.ds-root` selector, at least one `.ui-` selector, and all six
   DM Mono and Instrument Sans files. THE CSP SHALL be unchanged and the CSP spec
   SHALL record no violation beyond the one allowed Zod `allowsEval` probe.
   *(unit, Playwright)*
6. THE following behaviour SHALL stay green through the swap, with the SAME
   Playwright specs and no assertion edited: undo (there is no redo in v1, see Out
   of scope), canvas drag and nudge, timeline editing, save and load, the demo
   project, keyboard shortcuts, accessibility, and the performance budget. THE
   safety-net specs (design, "Safety-net specs") SHALL use only `getByRole`,
   `getByLabel`, and `getByText`, plus `page.evaluate` for document-wide
   invariants, and SHALL pass against the current UI before any screen is wired.
   THE accessibility spec SHALL use Playwright's built-in ARIA snapshot; it SHALL
   NOT add `axe-core` or `@axe-core/playwright` (MPL-2.0, outside the approved
   licences); the owner has declined an exception. *(Playwright)*
7. THE hand-written component that a wired screen replaces SHALL be deleted only
   after the replacement passes the safety-net specs. THE design SHALL list every
   file to be removed. WHEN the group ends there SHALL be no second UI for any WIRED
   route and no feature flag. DEFERRED routes keep their component. *(review)*
8. THE folder `apps/studio/src/generated/` SHALL NOT be edited by hand. A gap SHALL be
   fixed in the converter (`scripts/`) or in the design source, then regenerated.
   *(unit: `convert` determinism and the regenerate-diff-empty check)*
9. THE design source for a wired screen SHALL provide what the live behaviour needs
   before that screen's wiring task starts. THE gaps are listed in the design
   (D-1 to D-10). IF a gap that blocks a screen is unresolved when its wiring task
   is about to start, THEN the implementer SHALL STOP and ask the owner, who either
   supplies a revised design (re-run through the converter) or records a waiver per
   gap. *(review)*
10. THE wiring SHALL add no runtime or dev dependency, SHALL NOT change
    `src/tokens.css`, and SHALL NOT change anything under `packages/`. A catalog
    category table or param-range table that the engine lacks SHALL live in
    `apps/studio/src/wiring/` and SHALL have a drift test against `presetCatalog`
    and the effects' param schemas. *(unit for manifest and drift)*

---

## Out of scope (v1)

- Audio UI: the exporters support an AAC track, but studio v1 exposes no audio
  import or audio options in the export dialog.
- Redo (undo is covered by Requirement 16).
- Multi-select, rotate/scale handles, resizing text by dragging, canvas
  zoom/pan, and snapping to other layers.
- Lottie export; WebM-with-alpha export (deferred by owner decision).
- The `<motion-text>` embed web component (a separate later spec).
- Templates/presets gallery, sample-project library.
- Collaboration, sharing links, cloud storage, accounts — any backend or network
  feature.
- Dedicated mobile/touch layout (desktop layout only in v1).
- Keyframe-track editing UI (per-property keyframe curves) and keyframe editing
  generally, beyond effect params and layer timing.
- Design conversion (Requirements 17 and 18): porting design-system components beyond the 12; executing or porting
  the data scripts' state logic (the mockups' fake state); Tooltip, Modal, Tabs
  and similar components; changing `apps/studio/src/tokens.css`; any change under
  `packages/`. Wiring the generated screens into the live studio is Requirement 19.
- Within Requirement 19: wiring the Landing Page and Error States screens (both
  DEFERRED), the embed destination, WebM alpha, redo, canvas zoom, keyframe-curve
  editing, audio, and any change to the saved project schema (a project name).

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
| `@studio/exporters` | runtime | workspace:* | — (internal) | MP4 / PNG-sequence / GIF / WebP export and `detectCapabilities`. |
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
  - Property 10, no-op detection is exact (Req 16.7, 16.15): for any valid
    project and any action, `applyAction(p, a) === p` if and only if the result
    deep-equals `p`; the result is schema-valid and every layer keeps numeric
    `letterSpacing` and `lineHeight`.
  - Existing Property 3 (Drag bounds) is updated to refer to the frame-grid
    version, Property 8 (Req 5.2, 5.10).
  - Property 13, adapter binding coverage (Req 19.2): for any adapter state, an
    adapter's data keys equal its screen's `*_BINDINGS` exactly.
  - Property 14, adapter purity (Req 19.2, 19.3): same inputs give structurally
    equal data, and constructing the data calls no dispatcher.
  - Property 15, invalid effect params are never committed (Req 4.5): a rejected param
    edit returns the same project reference and every instance stays schema-valid.
  - Property 16, a finished export can always be retried (Req 8.5, 8.6): from a terminal
    state `reset` reaches the format step and `start` begins a new export.
- **Playwright** (bundled Chromium, localhost): preview playback/scrub, settings,
  layer and effect editing, timeline drags, font readiness, save/load, the export
  dialog end-to-end, preview/export parity, no-network session, and accessibility
  (keyboard, focus, dialog focus trap).
- **manual**: font licensing, reduced-motion feel, CSP in a real browser, and the
  performance budget number on a mid-range laptop.
