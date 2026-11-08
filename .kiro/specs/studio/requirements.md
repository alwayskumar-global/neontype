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

1. THE timeline SHALL show one row per layer with a bar whose left edge maps to
   `startSeconds` and whose width maps to `endSeconds - startSeconds`, on a time
   axis spanning `[0, durationSeconds]`. *(unit for mapping, Playwright)*
2. THE timeline SHALL show a playhead at the current preview time; dragging the
   playhead SHALL scrub the preview (same behaviour as Requirement 1.5). *(Playwright)*
3. WHEN the user drags a bar's body THE shell SHALL move the layer in time
   (changing `startSeconds` and `endSeconds` together, preserving duration),
   clamped to `[0, durationSeconds]`. *(unit, property, Playwright)*
4. WHEN the user drags a bar's edge THE shell SHALL trim that edge
   (`startSeconds` or `endSeconds`), keeping `endSeconds > startSeconds` and
   staying within `[0, durationSeconds]`. *(unit, property, Playwright)*
5. THE time↔pixel mapping SHALL be a pure function in the model/util layer,
   round-tripping within one pixel, and SHALL NOT read a wall-clock. *(unit, property)*
6. WHEN a drag completes THE model SHALL remain `ProjectSchema`-valid. *(property)*

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
   the `Project` with no DOM access and no wall-clock read. *(unit, property)*
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
2. THE app SHALL run under a strict CSP with no `eval`, no `new Function`, and no
   inline scripts; the build output SHALL contain no inline `<script>` with
   executable code. *(unit for build check, manual)*
3. THE app SHALL make NO network request at runtime (verified by failing the test
   if any `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`/dynamic font/CDN
   request occurs during a representative session). *(Playwright)*
4. AN opened project file SHALL be validated (Requirement 7.3) before any field
   is read by the app. *(unit)*
5. THE `design/` directory SHALL NOT be served or bundled, and `support.js` SHALL
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
   moving and trimming a layer (e.g. numeric start/duration inputs). *(Playwright)*

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
with no new runtime dependencies, so that the build stays clean and client-only.

#### Acceptance criteria

1. THE app SHALL live in `apps/studio` as a pnpm workspace member and SHALL
   declare runtime dependencies on `@studio/engine` and `@studio/exporters` only.
   *(unit for manifest)*
2. THE app SHALL use the repo's existing tooling (Vite, TypeScript strict,
   Vitest, Playwright, Zod, ESLint flat config with the three purity bans in
   `src`) and SHALL add NO new runtime dependency in this scope. *(unit)*
3. THE app SHALL NOT change any `tsconfig` outside `apps/studio`. *(unit)*
4. THE build SHALL be fully static (no server code) and SHALL emit no runtime
   network dependency. *(unit, manual)*
5. ANY UI-framework choice SHALL follow repo steering; if steering mandates one,
   the app uses it, and no additional UI dependency beyond what steering already
   establishes is introduced in this scope. *(manual — resolved in design.md)*

---

## Out of scope (v1)

- Audio UI: the exporters support an AAC track, but studio v1 exposes no audio
  import or audio options in the export dialog.
- Undo / redo history.
- Lottie export; WebM-with-alpha export; animated WebP export.
- The `<motion-text>` embed web component (a separate later spec).
- Templates/presets gallery, sample-project library.
- Collaboration, sharing links, cloud storage, accounts — any backend or network
  feature.
- Dedicated mobile/touch layout (desktop layout only in v1).
- Keyframe-track editing UI (per-property keyframe curves) beyond effect params
  and layer timing.

---

## Open questions

1. **Default new-project settings.** What canvas/fps/duration/background should a
   fresh project start with?
   *Recommended default:* 1280×720, 30 fps, 5 s, opaque `#101018`, one starter
   text layer with the `fade-slide` effect.
2. **Bundled font set.** Which exact open-licensed families (Latin + Tamil) ship,
   and how many weights?
   *Recommended default:* reuse the fonts already vendored for the engine visual
   tests — Noto Sans (Latin) and Noto Sans Tamil (OFL-1.1) — one or two weights
   each, self-hosted as woff2.
3. **Effect granularity selection.** Should the UI let the user choose
   per-effect granularity (character/word/line), or default to the first
   supported granularity?
   *Recommended default:* default to the effect's first `supportedGranularity`
   with an optional dropdown to change it among `supportedGranularities`.
4. **Preview resolution vs. canvas size.** Should the preview render at full
   canvas pixels or fit-to-container with CSS scaling?
   *Recommended default:* render at canvas pixel size into the backing store and
   fit-to-container via CSS transform, so preview pixels equal export pixels
   (preserving parity) regardless of on-screen size.
5. **Export output size default.** Should the export default to the project
   canvas size or offer a downscale preset?
   *Recommended default:* default to the exact project canvas size (no scale),
   with optional common downscale presets that keep the aspect ratio within the
   exporter's 1-pixel rule.

---

## Verification method summary

- **unit** (Vitest, Node): pure model transitions, mapping/util functions,
  error-code→message mapping, manifest/config audits, schema round-trips.
- **property** (fast-check): model transitions preserve `ProjectSchema` validity;
  timeline time↔pixel mapping round-trips; layer-timing invariants hold.
- **Playwright** (bundled Chromium, localhost): preview playback/scrub, settings,
  layer and effect editing, timeline drags, font readiness, save/load, the export
  dialog end-to-end, preview/export parity, no-network session, and accessibility
  (keyboard, focus, dialog focus trap).
- **manual**: font licensing, reduced-motion feel, CSP in a real browser, and the
  performance budget number on a mid-range laptop.
