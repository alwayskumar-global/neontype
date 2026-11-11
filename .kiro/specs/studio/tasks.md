# Implementation Plan: studio

## Overview

This plan builds `apps/studio` — the browser-only motion-text editor — as an
ordered series of coding tasks, front-loaded for an early vertical slice: a
demoable studio exists after Group 3 (preview + edit + export end to end). It
scaffolds the app (Vite + React + strict TS, strict CSP, Vercel static headers,
tooling, purity guard) and the pure model layer with its property tests (G1);
then fonts + preview + playback + transport + parity (G2); the editing panels and
the export dialog (G3); canvas drag, timeline editing, and undo (G4); save/load + a built-in demo project
(G5); the accessibility, performance, and CSP specs (G6); and repository
readiness + the final checkpoint (G7). Each task names the files it touches,
cites the requirement clauses and correctness properties it covers, states a
concrete completion check, and is committed once per group with a Conventional
Commit message. `studio` depends on `@studio/engine` and `@studio/exporters`
only; it holds no render, schema, or encoding logic.

Credit estimates are per group in the group heading (honest; the total is
reported). They are planning estimates, not budgets.

---

## Execution rules

- `design/` is a VISUAL REFERENCE ONLY. Never copy code, markup, inline styles,
  or scripts from any file in `design/` or from `support.js`; never serve or
  bundle `design/`. Rebuild each screen as React components in `apps/studio`,
  referencing only the extracted design tokens (`tokens.css`).
- Determinism: no `Math.random`, `Date.now`, or `performance.now` in the model
  layer or any frame-affecting path. The ONLY clock lives in
  `apps/studio/src/playback/` (the rAF loop and the perf instrument). The app
  `eslint.config.js` bans the three in `src/**`; the purity guard test asserts
  the bans fire. No `eslint-disable` in `src`.
- The project model is the single source of truth and is pure (DOM-free). UI
  state (selection, playhead, dialog state) is separate and never serialized
  into the saved project.
- Preview and every export derive each frame from the SAME engine render path;
  the studio contains no alternate or duplicated render logic. One
  `CanvasMetricsProvider` per canvas; never share a layout cache across providers.
- Security: strict CSP with NO `'unsafe-inline'` for scripts or styles; no inline
  `<script>`, no `<style>` element, no `style="..."` markup; dynamic styling only
  through the CSSOM. No `innerHTML` with user text. No runtime network request.
  Opened files are validated before use.
- Dependencies: runtime `@studio/engine`, `@studio/exporters`, `react`,
  `react-dom`; dev `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`
  plus the repo's existing tooling. Every added package is EXACT-pinned, resolved
  against the npm registry at install time (G1), OSI-licensed, and gets a
  `docs/dependencies.md` row (name, exact version, license, reason, publish date).
  No UI component / state / CSS-framework / router / icon / testing-library
  package. Any package beyond the approved list is proposed to the owner before
  installation — stop and wait.
- No `tsconfig` change outside `apps/studio`.
- Stop-and-wait on any property-based-test counterexample: show the counterexample
  before changing a formula, a bound, or the property.
- Every group ends with a checkpoint task (typecheck, lint, Vitest, and the
  group's Playwright specs) and a commit task (Conventional Commits). Each task
  cites the requirements/design sections it satisfies; property tasks cite the
  numbered properties.

---

## Tasks

- [ ] 1. Group 1: Scaffold + pure model layer  *(est. ~14 credits)*
  - [ ] 1.1 Scaffold `apps/studio` (Vite + React + strict TS) and resolve dependencies
    - Create `apps/studio/package.json` (`name: "@studio/app"`, `"private": true`, `"type": "module"`), scripts `dev`/`build`/`preview`/`lint`/`test`. Resolve each dependency against the npm registry with `npm view` and EXACT-pin: runtime `@studio/engine` (`workspace:*`), `@studio/exporters` (`workspace:*`), `react`, `react-dom`; dev `@vitejs/plugin-react` (compatible with the repo's Vite major), `@types/react`, `@types/react-dom`, and the repo tooling (`typescript`, `vitest`, `@playwright/test`, `eslint`, `typescript-eslint`, `vite`, `zod` as already present). Write a `docs/dependencies.md` row for each NEW package (name, exact version, license, publish date, reason); report any deviation from the requirements Approved-dependencies table.
    - Create `apps/studio/tsconfig.json` (strict, React JSX, bundler resolution) — NO tsconfig change outside `apps/studio`. `pnpm-workspace.yaml` already globs `apps/*`.
    - Create `apps/studio/vite.config.ts` with `@vitejs/plugin-react`, `root` scoped to the app, static build output, and the entry `index.html`.
    - Run `pnpm install`; if pnpm blocks a build script or prompts for approval, STOP and show the prompt.
    - **Covers:** Requirement 14.1, 14.2, 14.3, 14.5, 14.6; Design "Overview", "Architecture"
    - **Completion:** `pnpm install` succeeds; `apps/studio` resolves as a workspace member; `pnpm --filter @studio/app exec tsc --noEmit` passes on an empty app; `docs/dependencies.md` has a row per new package with the ACTUAL resolved versions.

  - [ ] 1.2 Strict CSP, Vercel headers, and the design-token sheet
    - Create `apps/studio/index.html` with the module entry as an external `<script type="module" src>` (no inline script), a `<meta http-equiv="Content-Security-Policy">` mirroring the production CSP, and NO `<style>` element or `style="..."` attribute.
    - Create `apps/studio/vercel.json` setting the SAME CSP as an HTTP header and configuring static output (the built `dist` as the served root). CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
    - Create `apps/studio/src/tokens.css` with design tokens (colours, type scale, spacing, radii, shadows) EXTRACTED from `design/` — values only, no copied markup/scripts.
    - **Covers:** Requirement 11.2; Design "CSP and security"
    - **Completion:** `index.html` and `vercel.json` carry the identical CSP string with no `'unsafe-inline'`; a grep over `index.html` finds no inline `<script>`, `<style>`, or `style=` attribute.

  - [ ] 1.3 ESLint flat config, Vitest/Playwright config, and the purity guard
    - Create `apps/studio/eslint.config.js` (ESLint flat, `typescript-eslint`) with `no-restricted-properties` banning `Math.random`, `Date.now`, `performance.now` in `src/**`, and an override allowing them ONLY in `src/playback/**` (the clock). Add `no-restricted-imports` or a build check banning imports from `design/` and `support.js`.
    - Create `apps/studio/vitest.config.ts` (`environment: "node"` for model tests; `include: ["src/**/*.test.ts","src/**/*.test.tsx"]`) and `apps/studio/playwright.config.ts` (localhost web server via `vite`, bundled Chromium, `testDir: tests/`).
    - Create `apps/studio/src/__tests__/purity.test.ts` asserting the three bans fire outside `src/playback/`.
    - **Covers:** Requirement 10.4, 11.5, 14.2; Design "Module layout", Execution rules
    - **Completion:** `pnpm --filter @studio/app lint` passes on the scaffold; the purity guard test passes; a probe import from `design/` fails lint.

  - [ ] 1.4 Pure model: Project factory, actions, transitions, selectors
    - Create `apps/studio/src/model/project.ts` (new-project factory producing the accepted default: 1280×720, 30 fps, 5 s, opaque `#101018`, one `fade-slide` starter layer — Open Question 1), `actions.ts` (discriminated-union `Action` for settings edits, layer add/edit/delete/reorder, effect add/param/remove, timeline move/trim), `transitions.ts` (pure `(Project, Action) => Project`, rejecting schema-invalid results by returning the input unchanged), and `selectors.ts` (`frameCountFor`, layer-by-id, active layers at `t`, etc.). No DOM, no clock.
    - Create `apps/studio/src/model/timemap.ts` (pure `timeToX`/`xToTime`).
    - **Covers:** Requirement 2.1–2.5, 3.1–3.7, 4.2–4.6, 10.1, 10.2, 10.3, 10.5; Design "Data Models / State"
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model` passes; transitions never return a schema-invalid project.

  - [ ] 1.5 Property tests for the model (Properties 1, 2)
    - In `apps/studio/src/model/transitions.test.ts` add a fast-check test tagged `// Feature: studio, Property 1: Schema-preserving transitions` asserting that for any `ProjectSchema`-valid project (local arbitrary) and any `Action`, the result is schema-valid OR the unchanged input. In `apps/studio/src/model/timemap.test.ts` add `// Feature: studio, Property 2: Time-pixel round-trip` asserting `xToTime(timeToX(t)) ~= t` within one pixel and the integer-x inverse. Each >= 100 iterations. On any counterexample, STOP and show it.
    - **Covers:** Requirement 5.3, 10.3; Design Properties 1, 2
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model` passes; both properties run >= 100 iterations with no counterexample (run 3x).

  - [ ] 1.6 Checkpoint — Group 1
    - Run `pnpm --filter @studio/app exec tsc --noEmit`, `pnpm --filter @studio/app lint`, `pnpm --filter @studio/app exec vitest run`.
    - **Completion:** all three exit 0 with zero failures.
    - Commit: `feat(studio): scaffold app, strict CSP, and pure model layer`

- [ ] 2. Group 2: Fonts, preview pipeline, playback, transport, parity  *(est. ~16 credits)*
  - [ ] 2.1 Bundle fonts and the readiness gate
    - Bundle four self-hosted woff2 into `apps/studio/src/fonts/` (or `public/fonts/`): weights 400 and 700 for BOTH families — `noto-sans-latin-400-normal.woff2`, `noto-sans-latin-700-normal.woff2` (family "Noto Sans", OFL-1.1) and `noto-sans-tamil-tamil-400-normal.woff2`, `noto-sans-tamil-tamil-700-normal.woff2` (family "Noto Sans Tamil", OFL-1.1); include each family's OFL-1.1 licence file. Create `fonts.css` (`@font-face` for each family/weight, self-hosted, no network) and `fonts/fonts.ts` exposing `whenFontsReady()` that loads the `FontFace`s, adds them to `document.fonts`, awaits `document.fonts.ready`, and maps a load timeout to `font-not-ready` and a decode failure to `font-decode-failed`. The layer `fontWeight` control selects 400 or 700.
    - **Covers:** Requirement 6.1–6.5; Design "Fonts"
    - **Completion:** `whenFontsReady()` resolves ready after the fonts load; a forced failure resolves the mapped error; `docs/dependencies.md` font licences noted if not already.

  - [ ] 2.2 Playback clock and performance instrument
    - Create `apps/studio/src/playback/clock.ts` — the rAF loop that owns `requestAnimationFrame`, derives current time from elapsed real time, supports play/pause/loop/scrub, and emits the current `t`. Create `playback/perf.ts` — the frame-interval instrument (mean + p95) reading rAF timestamps. These are the ONLY files permitted the wall-clock.
    - **Covers:** Requirement 1.2, 1.3, 1.4, 1.7, 13.2a; Design "Architecture / playback"
    - **Completion:** unit tests for loop-wrap math and scrub clamping pass; the purity guard still passes (bans allowed only here).

  - [ ] 2.3 Preview canvas + metrics provider + draw
    - Create `apps/studio/src/preview/PreviewCanvas.tsx` owning the `<canvas>` at project pixel size and ONE `CanvasMetricsProvider`, and `preview/draw.ts` calling `renderFrame(project, t, { ctx, metricsProvider })`. Wire the clock to draw per frame WITHOUT re-rendering React per frame (draw reads the live store snapshot). CSS fit-to-container via transform; checkerboard behind a transparent canvas.
    - **Covers:** Requirement 1.1, 2.6, 2.7; Design "Components / Preview pipeline"
    - **Completion:** a Playwright smoke renders a known project and asserts a non-blank canvas; one provider per canvas (asserted in a unit/towards-parity check).

  - [ ] 2.4 Transport controls + frame/time readout
    - Create the play/pause/loop/scrub transport UI and the frame-index/time/total-frame readout, driven by the clock and the store. Scrubbing shows the clamped frame without starting playback.
    - **Covers:** Requirement 1.2, 1.3, 1.4, 1.5, 1.6, 1.8; Design "Components / Preview pipeline"
    - **Completion:** `tests/preview.spec.ts` passes (play advances, pause holds, loop wraps, scrub clamps, readout correct).

  - [ ] 2.5 Preview/export parity test
    - Create `apps/studio/tests/parity.spec.ts` rendering a fixed project at a fixed frame index via the preview path and via the exporter's `FrameRenderer`, compositing both over the same opaque background, asserting diffRatio <= 0.01 at 24/255 per channel, each with its own `CanvasMetricsProvider` and no shared cache.
    - **Covers:** Requirement 9.1, 9.2, 9.3, 9.4; Design "Preview pipeline — parity test design"
    - **Completion:** `pnpm --filter @studio/app exec playwright test tests/parity.spec.ts` passes.

  - [ ] 2.6 Checkpoint — Group 2
    - Run typecheck, lint, Vitest, and `playwright test tests/preview.spec.ts tests/parity.spec.ts`.
    - **Completion:** all pass.
    - Commit: `feat(studio): fonts, preview pipeline, playback, and parity`

- [ ] 3. Group 3: Editing panels + export dialog (demoable end to end)  *(est. ~18 credits)*
  - [ ] 3.1 Settings panel
    - Create `apps/studio/src/panels/SettingsPanel.tsx`: canvas width/height with presets (1920×1080, 1280×720, 1080×1080, 1080×1920) and custom integer entry within engine bounds; fps (1–120) and duration (0.1–600) inputs; background colour + transparent toggle. Out-of-bound entries are rejected/clamped with an inline message and never written invalid. All edits dispatch model transitions; preview updates live.
    - **Covers:** Requirement 2.1–2.7; Design "Components / panels"
    - **Completion:** `tests/settings.spec.ts` passes.

  - [ ] 3.2 Layers panel
    - Create `apps/studio/src/panels/LayersPanel.tsx`: add/edit-text/delete/reorder layers; per-layer `fontFamily` (the two bundled families), `fontSize`, `fontWeight`, `fill`, `align`, `anchor` position, and start offset / duration (deriving `endSeconds`). Text is rendered via React text nodes only (no `innerHTML`). Reorder changes `Project.layers` order (draw order). Invalid edits rejected inline.
    - **Covers:** Requirement 3.1–3.7; Design "Components / panels"
    - **Completion:** `tests/layers.spec.ts` passes (incl. draw-order-follows-order and no-innerHTML check).

  - [ ] 3.3 Effect picker
    - Create `apps/studio/src/panels/EffectsPanel.tsx`: list exactly the engine `presetCatalog` (12 presets) by id/displayName; applying adds an `EffectInstance` with the catalog `defaultParams` and the first `supportedGranularity` (Open Question 3), with a dropdown to change granularity among supported ones; param editors seeded from defaults; invalid params rejected inline; remove effect. Preview updates live.
    - **Covers:** Requirement 4.1–4.6; Design "Components / panels"
    - **Completion:** `tests/effects.spec.ts` passes (picker lists 12 from the catalog, no hardcoded list).

  - [ ] 3.4 Export dialog state machine + error map
    - Create `apps/studio/src/export/machine.ts` (pure state machine: idle → configuring → running → done/failed/cancelled) and `export/errors.ts` (exhaustive `Record<ErrorCode, string>` over all 12 codes). `machine.ts` has no DOM/clock.
    - **Covers:** Requirement 8.5, 8.6; Design "Export dialog state machine", "Error Handling"
    - **Completion:** unit tests for every state transition pass; the error map compiles exhaustively.

  - [ ] 3.5 Export dialog UI over `@studio/exporters`
    - Create `apps/studio/src/export/dialog.tsx`: call `detectCapabilities()` on open; offer EXACTLY MP4, PNG sequence, GIF; disable an `unsupported` format with its reason; per-format option fields (MP4 `videoBitrate`/`backgroundFallback`; output size) seeded from the project; progress bar from `onProgress`; Cancel via an `AbortController` signal → `cancelled`; success offers the file for download by `fileName`; the `mp4-no-transparency` note shown for a transparent project targeting MP4; errors shown via the error map. The export runs off the main thread when the exporter uses a worker, and the dialog stays responsive.
    - Done: the dialog passes the four bundled font files to the exporters as `fonts` bytes (fetched once, memoized; the font gate is memoized per document) so Worker exports match the preview; a font failure now shows in the dialog because it enters the running state before the font checks. _Requirements: 6.1–6.5, 8.6, 9.1_
    - **Covers:** Requirement 8.1, 8.2, 8.3, 8.4, 8.7, 8.8, 8.9; Design "Export dialog state machine"
    - **Completion:** `tests/export.spec.ts` passes (format set, gating, progress, cancel, success download, note, error mapping).

  - [ ] 3.6 Property test for the error map (Property 5) + app shell wiring
    - Add `// Feature: studio, Property 5: ErrorCode map total` asserting every `ErrorCode` (iterating the exporters' `ERROR_CODES`) maps to a non-empty message. Create `apps/studio/src/shell/App.tsx` + `store.ts` composing preview + panels + export into a demoable layout following `design/` as a visual reference only.
    - **Covers:** Requirement 8.6, 10.2; Design Property 5, "Components / shell"
    - **Completion:** the property passes (>= 100 iterations, 3x); the app runs end to end (type → effect → preview → export) in `tests/export.spec.ts`.

  - [ ] 3.7 Minimal root README
    - Create a minimal repository root `README.md`: what the project is (the browser-only, client-side motion-text studio — no legacy name/assets), prerequisites, the install / dev / test / build commands, the workspace layout, and one line pointing at `docs/dependencies.md`. Group 7 expands this to the full Requirement 15 README (disclosure, "Built with Kiro", Vercel deploy).
    - **Covers:** Requirement 15.1, 15.2, 15.3, 15.4 (minimal; full in Task 7.1)
    - **Completion:** root `README.md` exists with those sections and the `docs/dependencies.md` pointer.

  - [ ] 3.8 Checkpoint — Group 3
    - Run typecheck, lint, Vitest, and `playwright test tests/settings.spec.ts tests/layers.spec.ts tests/effects.spec.ts tests/export.spec.ts`.
    - **Completion:** all pass; a demoable studio exists.
    - Commit: `feat(studio): editing panels and export dialog`

- [ ] 4. Group 4: Canvas drag, timeline editing, and undo  *(est. ~22 credits)*
  - [ ] 4.1 Store history and gesture API
    - In `apps/studio/src/shell/store.ts` (move to `apps/studio/src/shell/history.ts` only if `store.ts` passes ~200 lines) add `history: Project[]` capped at `HISTORY_LIMIT = 100` (oldest dropped), holding `Project` values only (structurally shared, no copies). `dispatchGuarded` pushes the previous project on an accepted change and adds nothing for a rejected or unchanged (same-reference) action. Add `beginGesture` (commits any open gesture first), `preview` (live, no history, no-op without an open gesture), `commitGesture` (one step iff `project !== base`), `cancelGesture`, `undo` (cancels an open gesture, else pops history), `canUndo`. `setProject` replaces the project and clears history and any gesture. After `undo` and `cancelGesture`, keep `ui.selectedLayerId` if the layer still exists, else `layers[0]?.id ?? null`, and clamp `ui.playhead` to the restored `durationSeconds`. Follow the state table in the design "Undo history and gestures". No DOM, no clock.
    - Create `apps/studio/src/shell/store.test.ts` (Vitest, Node, no DOM): the design table row by row, the cap (the 101st push drops the oldest), gesture commit with and without change, cancel, mid-gesture undo, `setProject` clearing history, selection fix-up, and structural sharing (`history[i].canvas === next.canvas` after a layers-only edit).
    - Add the fast-check test tagged `// Feature: studio, Property 9: Undo restores` using the existing `arb-project` and action arbitraries interleaved with gesture groups, >= 100 iterations. On any counterexample, STOP and show it before changing a bound, the store, or the property.
    - **Covers:** Requirement 16.1, 16.2, 16.3, 16.5, 16.6, 16.7, 16.8; Design "Undo history and gestures", Property 9
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/shell/store.test.ts` passes, including Property 9 (>= 100 iterations, run 3x with no counterexample).

  - [ ] 4.2 Pure frame-grid timeline math
    - Create `apps/studio/src/model/timeline.ts` (pure; no DOM, no clock) exporting `toFrames` (round-half-away-from-zero), `toSeconds` (rounded to 1e-6), `snapToFrame`, `pxToSeconds` (uses `timemap.xToTime`, snaps, clamps to `[0, toSeconds(N)]` with `N = floor(durationSeconds * fps + 1e-9)`), `dragTiming(kind, start, deltaFrames, fps, durationSeconds)` for `move | start | end`, and `nudgeTiming`. Implement the exact rules in the design "Timeline interaction model": snap on entry, `move` preserves frame length, `start`/`end` keep at least 1 frame, `N < 1` returns the input unchanged, `N = 1` yields `{0, 1/fps}`, non-finite delta is 0. The old `timeline/drag.ts` is not created.
    - Create `apps/studio/src/model/timeline.test.ts`: examples for `toFrames` ties, `toSeconds` rounding, each kind including off-grid input, `N < 1`, `N = 1`, fps change, `nudgeTiming` 1 and 10 frames, and `pxToSeconds`/`snapToFrame`.
    - Add `// Feature: studio, Property 8: Timing drag stays on the frame grid` (frame-grid check `|sec * fps - round(sec * fps)| < 1e-4`, `0 <= start < end <= duration` with `1e-9` slack, `move` length preserved) and extend `timemap.test.ts` so `// Feature: studio, Property 2: Time-pixel round-trip` also covers the pixel round-trip used by `pxToSeconds`. Each >= 100 iterations. Property 3 is satisfied by Property 8. On any counterexample, STOP and show it before changing a formula, a bound, or the property.
    - **Covers:** Requirement 5.1, 5.2, 5.3, 5.10, 10.1; Design "Timeline interaction model", Properties 2, 3, 8
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model` passes; Properties 2 and 8 run >= 100 iterations with no counterexample (run 3x).

  - [ ] 4.3 Pure canvas hit testing and drag math
    - Create `apps/studio/src/model/hit.ts` (pure; no DOM, no clock) exporting `Rect`, `layerBounds` (visible clusters only, box `layoutX..layoutX+width` by `layoutY-0.8h..layoutY+0.2h`, shifted by `anchor + transform.positionOffset`, effect scale/rotation/blur/opacity ignored, `null` when no visible cluster), `rectContains`, `hitTest` (last layer first, pad `8 / displayScale`, `displayScale <= 0` or non-finite treated as 1), `clientToCanvas` (`null` for a zero-size rect, no clamping), `dragAnchor` (Shift keeps the dominant axis, tie keeps x; round to `snap ?? 1` before clamping to `[0, w] x [0, h]`), and `nudgeAnchor` (1 px, 10 with Shift, clamped, `null` for non-arrow keys).
    - Create `apps/studio/src/model/hit.test.ts` with the unit cases listed in the design "Unit tests", plus `// Feature: studio, Property 6: Drag identity` and `// Feature: studio, Property 7: Drag stays in canvas and on the grid` with the design arbitraries, each >= 100 iterations. On any counterexample, STOP and show it before changing a formula, a bound, or the property.
    - Extend `apps/studio/src/__tests__/purity.test.ts` so the purity guard also covers `model/hit.ts` and `model/timeline.ts` (no `Math.random`, `Date.now`, `performance.now`, no DOM globals).
    - **Covers:** Requirement 3.8, 3.9, 3.10, 3.12, 3.13, 3.15, 10.1, 10.4; Design "Canvas hit testing", Properties 6, 7
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model src/__tests__` passes; Properties 6 and 7 run >= 100 iterations with no counterexample (run 3x); the purity test fails if a banned call is added to `hit.ts` or `timeline.ts`.

  - [ ] 4.4 CSS custom property helper and no-inline-style guard
    - Create `apps/studio/src/ui/cssvars.ts` exporting `setCssVars(el, vars)` over a minimal structural element type (`{ style: { setProperty(name, value) } }`): every key must start with `--` and numbers must be finite, otherwise throw a typed `Error`; values are written as `String(value)`.
    - Create `apps/studio/src/ui/cssvars.test.ts` with a fake element (`vi.fn()` for `setProperty`): exact names and stringified values, throws for a name without `--` and for a non-finite number.
    - Add a guard that fails on a JSX `style=` attribute or prop and on `dangerouslySetInnerHTML` in `apps/studio/src/**/*.tsx`: an ESLint rule in `apps/studio/eslint.config.js` (`react`-free `no-restricted-syntax` selector on `JSXAttribute[name.name='style']`), or a static audit test `apps/studio/src/__tests__/no-inline-style.test.ts`. No `eslint-disable` in `src`.
    - **Covers:** Requirement 11.1, 11.2; Design "CSS custom property helper"
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/ui src/__tests__` passes; a probe `.tsx` containing `style={{}}` makes the guard fail, and the existing source passes it.

  - [ ] 4.5 Canvas selection, drag, nudge, and overlay in `PreviewCanvas`
    - In `apps/studio/src/preview/PreviewCanvas.tsx` add a hit-only `CanvasMetricsProvider` bound to a detached `document.createElement("canvas")` context, with its own layout cache, recreated in the existing fonts `loadingdone` callback and whenever the canvas size changes; compute the hit `FrameState` with `computeFrameState(project, playhead, { metricsProvider, layoutCache })` on pointerdown and when the overlay refreshes. Never share this provider with the paint renderer or any export.
    - Pointer handling with `setPointerCapture`: primary-button `pointerdown` uses `clientToCanvas` and `hitTest` (empty canvas leaves the selection unchanged; a hit selects the layer, pauses the clock, calls `store.beginGesture()`, focuses the canvas); `pointermove` runs `dragAnchor` (Shift axis lock) and `store.preview({ type: "set-anchor", ... })`; `pointerup` calls `commitGesture`; `pointercancel` and `lostpointercapture` without `pointerup` call `cancelGesture`. Without a drag, `pointermove` only toggles the `is-over-layer` class.
    - Keyboard: the canvas has `tabindex="0"`, an `aria-label`, and a focus-visible style in `layout.css`; `keydown` uses `nudgeAnchor` and, when non-null, `preventDefault()` plus `store.dispatchGuarded(set-anchor)` (one step per press); other keys are ignored.
    - Selection outline: a sibling `<div class="selection-outline" aria-hidden="true">` positioned by `setCssVars` (`--x`, `--y`, `--w`, `--h`) from the unpadded `layerBounds` times the display scale, in `useLayoutEffect`; hidden when nothing is selected, the layer has no bounds, or playback is running. Cursor via classes `is-over-layer` and `is-dragging` in `layout.css`; `touch-action: none` on the canvas. Canvas pixel size and the transparent flag follow `project.canvas` width, height, and background (also after New or Open).
    - **Covers:** Requirement 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 11.2; Design "Canvas interaction model", "Where the bounds come from"
    - **Completion:** `pnpm --filter @studio/app exec tsc --noEmit` and lint pass; `tests/canvas-drag.spec.ts` (task 4.8) passes against this component; the parity probe still reports 0 with a layer selected.

  - [ ] 4.6 Timeline component, StudioView wiring, and layout
    - Create `apps/studio/src/timeline/Timeline.tsx`: a ruler with `role="slider"` (`aria-label="Playhead"`, `aria-valuemin`/`aria-valuemax`/`aria-valuenow` in seconds, `aria-valuetext`) that scrubs via `pxToSeconds` on click or drag and with ArrowLeft/Right (1 frame, 10 with Shift); a playhead at the current time; one row per layer with a bar (`move`), a start handle, and an end handle, each focusable with `role="slider"`, an `aria-label` such as `"Title, move"`, and `aria-valuenow`/`aria-valuemin`/`aria-valuemax` in seconds plus `aria-valuetext` like `"1.20 seconds"`. Rows render `aria-disabled` when the duration is under one frame.
    - Pointer drag: `setPointerCapture`, `store.beginGesture()`, select the layer, `deltaFrames` from the pointer-down position each move (not accumulated), `dragTiming`, `store.preview({ type: "set-layer-timing", ... })`; `pointerup` calls `commitGesture` (one step); `pointercancel` calls `cancelGesture`. Arrow keys on a focused part call `nudgeTiming` and `store.dispatchGuarded` (one step per press); other keys ignored. All bar, handle, playhead, and ruler geometry goes through `setCssVars` (`--from`, `--len`, `--at`); no `style` prop.
    - Wire the component into `apps/studio/src/shell/StudioView.tsx` and add the timeline styles (consuming the CSS variables, focus-visible, reduced-motion) to `apps/studio/src/shell/layout.css`. The Layers panel numeric start/duration inputs stay unchanged.
    - **Covers:** Requirement 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.11, 11.2, 12.6; Design "Timeline component"
    - **Completion:** `pnpm --filter @studio/app exec tsc --noEmit` and lint pass; `tests/timeline.spec.ts` (task 4.8) passes against this component.

  - [ ] 4.7 Ctrl/Cmd+Z handler
    - In `apps/studio/src/shell/StudioView.tsx` register one `keydown` listener on `window` (removed on unmount) acting on `(ctrlKey || metaKey) && key.toLowerCase() === "z" && !shiftKey`. Return early, without `preventDefault`, when `event.target` is an `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`, or `isContentEditable`; otherwise `preventDefault()` and `store.undo()` (a mid-gesture press cancels the gesture). No redo binding.
    - **Covers:** Requirement 16.2, 16.4, 16.6; Design "Keyboard"
    - **Completion:** typecheck and lint pass; the undo cases in `tests/canvas-drag.spec.ts` and `tests/timeline.spec.ts` (task 4.8) pass, including that Ctrl/Cmd+Z inside a number input does not undo the project.

  - [ ] 4.8 Playwright specs for canvas drag, timeline, and undo
    - Create `apps/studio/tests/canvas-drag.spec.ts`: click selects the right layer and an empty click keeps the selection; dragging the title changes the anchor X/Y fields and the `#ffcc00` pixel bounding box follows by the same delta; Shift locks an axis; releasing outside the canvas still commits; the outline overlay matches the bbox; Arrow nudge moves +1 px and Shift+Arrow +10 px, other keys are ignored; Ctrl/Cmd+Z restores the drag and each nudge in one step; Ctrl/Cmd+Z inside a number input does not undo the project.
    - Create `apps/studio/tests/timeline.spec.ts`: bars map start and width; ruler scrub snaps to frames; dragging a timeline end handle lands the end on a frame (`aria-valuenow * fps` is whole) and changes the duration; Arrow and Shift+Arrow nudge by 1 and 10 frames; slider ARIA attributes; Ctrl/Cmd+Z restores the end-handle drag in one step.
    - Keep the Landing and export specs green; run the CSP spec (`playwright.csp.config.ts`, `tests-csp`) with a canvas drag, a nudge, and a timeline drag added to the session, asserting zero new violations beyond the single named Zod eval probe; assert `await window.__studioExportParity(3)` is exactly 0.
    - **Covers:** Requirement 3.11, 3.12, 3.14, 3.15, 3.16, 3.18, 5.4, 5.6, 5.7, 5.8, 11.3, 16.2, 16.4, 16.9
    - **Completion:** `pnpm --filter @studio/app exec playwright test tests/canvas-drag.spec.ts tests/timeline.spec.ts` passes; the CSP spec passes with zero new violations; the parity probe returns exactly 0.

  - [ ] 4.9 Checkpoint — Group 4
    - Run `pnpm --filter @studio/app exec tsc --noEmit`, `pnpm --filter @studio/app lint`, `pnpm --filter @studio/app exec vitest run`, the studio Playwright suite, the CSP spec, and the parity probe (`await window.__studioExportParity(3)` is exactly 0). Run `git diff --stat -- packages/` and confirm it shows no change under `packages/` (exporters and engine untouched).
    - If any property test fails, show the counterexample and stop before changing a bound.
    - **Completion:** all commands exit 0; the parity probe is exactly 0; `git diff` shows no change under `packages/`.
    - Commit: `feat(studio): canvas drag and timeline editing`

- [ ] 5. Group 5: Save/load + built-in demo project  *(est. ~10 credits)*
  - [ ] 5.1 Save and load
    - Create `apps/studio/src/io/save.ts` (`serializeProject` → Blob download, named JSON) and `io/load.ts` (file input → `parseProject` → typed result; on `ParseError` show a specific message and leave the project unchanged; on success replace the store project and reset UI selection/playhead). No network; file validated before any field is read.
    - Done: downloads (project save and export) go through one `downloadBlob` helper that revokes the object URL after 60 s, not synchronously. _Requirements: 7.1, 8.8_
    - Done: opening a project file rejects files over 5 MiB by `file.size` before reading them. _Requirements: 7.1–7.6, 11.4_
    - **Covers:** Requirement 7.1–7.6, 10.5, 11.4; Design "Save / load"
    - **Completion:** `tests/saveload.spec.ts` passes (round-trip, invalid-file error, valid-replace).

  - [ ] 5.2 Save/load round-trip property (Property 4)
    - Add `// Feature: studio, Property 4: Save/load round-trip` asserting `parseProject(serializeProject(p))` deep-equals `p`, carries `schemaVersion`, and leaks no UI state. On counterexample, STOP and show.
    - **Covers:** Requirement 7.1, 7.2, 10.5; Design Property 4
    - **Completion:** the property passes (>= 100 iterations, 3x).

  - [ ] 5.3 Built-in demo project
    - Create `apps/studio/src/model/demo.ts`: a schema-valid showcase project with several layers exercising a range of the 12 effects AND at least one Tamil-text layer (family "Noto Sans Tamil"), loaded by default on first open for the demo video. It is a `Project` value only (no UI state).
    - **Covers:** Requirement 6.2 (Tamil), 3.x, 4.x; Design "Fonts", Open Question 1
    - **Completion:** `demo.ts` passes `ProjectSchema.safeParse`; a Playwright check loads it by default and renders Tamil glyphs.

  - [ ] 5.4 Checkpoint — Group 5
    - Run typecheck, lint, Vitest, and `playwright test tests/saveload.spec.ts`.
    - **Completion:** all pass.
    - Commit: `feat(studio): save/load and built-in demo project`

- [ ] 6. Group 6: Accessibility, performance, and CSP specs  *(est. ~12 credits)*
  - [ ] 6.1 Accessibility pass
    - Ensure all interactive controls are keyboard-operable with programmatic labels and visible focus; the export dialog traps focus, closes on Escape, and restores focus to the invoker; reduced-motion reduces UI chrome transitions only (not the preview); add the keyboard timeline equivalents if not already present. Add `tests/a11y.spec.ts`.
    - Done: the export dialog traps Tab/Shift+Tab, returns focus to the opener on close, and aborts a running export when closed. _Requirements: 12.1–12.6_
    - **Covers:** Requirement 12.1–12.6; Design "Error Handling"/shell
    - **Completion:** `tests/a11y.spec.ts` passes.

  - [ ] 6.2 Performance measurement spec
    - Create `apps/studio/tests/perf.spec.ts` loading the 1280×720 / 5-layer / one-effect-each fixture, playing for a fixed 10 s window, computing mean and p95 frame interval via `playback/perf.ts`, and reporting the measured numbers; PASS when mean <= `1000/fps` ms and p95 <= 1.5x that.
    - **Covers:** Requirement 13.1, 13.2, 13.2a, 13.3; Design "Performance measurement"
    - **Completion:** `tests/perf.spec.ts` runs and reports numbers; indicative on CI, authoritative manually.

  - [ ] 6.3 CSP-violation spec
    - Create `apps/studio/tests/csp.spec.ts` listening for `securitypolicyviolation` events and CSP console errors across a representative session (edit, preview, open dialog, export), asserting ZERO violations. Also assert no `style`/`script` markup injection path is exercised.
    - Done: a production-build Playwright test runs a worker-path export under the strict CSP. _Requirements: 11.2, 11.3_
    - **Covers:** Requirement 11.2, 11.3; Design "CSP and security", risk 2
    - **Completion:** `tests/csp.spec.ts` passes with zero violations.

  - [ ] 6.4 Checkpoint — Group 6
    - Run typecheck, lint, Vitest, and `playwright test tests/a11y.spec.ts tests/perf.spec.ts tests/csp.spec.ts tests/security.spec.ts`.
    - **Completion:** all pass (perf reports numbers).
    - Commit: `feat(studio): accessibility, performance, and CSP verification`

- [ ] 7. Group 7: Repository readiness + final checkpoint  *(est. ~10 credits)*
  - [ ] 7.1 Root README and deploy docs
    - Create/finalize the repository root `README.md` per Requirement 15: product summary (no legacy name/assets); prerequisites (the required Node and the repo's pnpm version); install/dev/test/build commands (incl. the `apps/studio` dev + build commands); workspace layout (`packages/engine`, `packages/exporters`, `apps/studio`, `docs/`, `.kiro/`); a "Built with Kiro" section (specs, steering, hooks, property-based testing); a third-party & disclosure section (planning + visual design produced OUTSIDE Kiro with Claude and Claude Design, all code written in Kiro) linking to `docs/dependencies.md`; and a Vercel static-output deploy section (build command, output dir, the CSP headers via `vercel.json`).
    - Finalize `apps/studio/README.md` (usage + the design-as-reference rule) and verify `docs/dependencies.md` lists the studio deps with exact versions/licences/reasons and the publish dates recorded at install.
    - **Covers:** Requirement 15.1–15.6; Design "Overview"
    - **Completion:** the root README has all six required sections and the deploy section; `docs/dependencies.md` is complete for the studio deps.

  - [ ] 7.2 Final checkpoint and no-drift check
    - Run root `pnpm test` (whole-workspace typecheck + lint + Vitest) AND the full `apps/studio` Playwright suite. Confirm NO drift: `apps/studio` runtime deps are exactly `@studio/engine`, `@studio/exporters`, `react`, `react-dom` (+ the approved dev deps); no dependency beyond the approved set; no `tsconfig` change outside `apps/studio`; the engine visual goldens are unchanged (no modified files under the engine's visual snapshots).
    - **Covers:** Requirement 9, 10, 11, 12, 13, 14; Design "Testing Strategy"
    - **Completion:** root `pnpm test` exits 0; the full studio Playwright suite passes; the no-drift check passes.
    - Commit: `docs(studio): repository readiness and final checkpoint`

- [ ] 8. Group 8: Reserve (only if needed)
    - Reserved for overflow from G1–G7 (e.g. a design-fidelity polish pass or a Playwright flake-stabilisation pass). Not planned work; opened only with owner approval.

---

## Notes

- No task is optional; every property-based test is required and tagged
  `// Feature: studio, Property N: ...`, runs >= 100 iterations, and is run 3x
  before relying on it.
- `design/` is a visual reference only: never copy its code/markup/styles/scripts,
  never serve or bundle it; rebuild screens from `tokens.css` and the design as
  reference.
- One `CanvasMetricsProvider` per canvas; the model is pure and the only clock is
  in `apps/studio/src/playback/`.
- Per-group checkpoints run `pnpm --filter @studio/app exec tsc --noEmit`,
  `pnpm --filter @studio/app lint`, `pnpm --filter @studio/app exec vitest run`, plus the
  group's Playwright specs; the final checkpoint (G7) runs root `pnpm test` and
  the full studio Playwright suite.
- On any property counterexample, stop and show the user before changing a
  formula, a bound, or the property.

## Correctness properties referenced

- Property 1: Schema-preserving transitions (Task 1.5)
- Property 2: Time-pixel round-trip (Task 1.5; pixel round-trip also exercised in Task 4.2)
- Property 3: Timing drag bounds, frame-grid version (superseded by and satisfied by Property 8, Task 4.2)
- Property 4: Save/load round-trip (Task 5.2)
- Property 5: ErrorCode map total (Task 3.6)
- Property 6: Drag identity (Task 4.3)
- Property 7: Drag stays in canvas and on the grid (Task 4.3)
- Property 8: Timing drag stays on the frame grid (Task 4.2)
- Property 9: Undo restores (Task 4.1)


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["1.6"] },
    { "id": 5, "tasks": ["2.1", "2.2"] },
    { "id": 6, "tasks": ["2.3"] },
    { "id": 7, "tasks": ["2.4", "2.5"] },
    { "id": 8, "tasks": ["2.6"] },
    { "id": 9, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 10, "tasks": ["3.5"] },
    { "id": 11, "tasks": ["3.6"] },
    { "id": 12, "tasks": ["3.7"] },
    { "id": 13, "tasks": ["3.8"] },
    { "id": 14, "tasks": ["4.1", "4.2", "4.4"] },
    { "id": 15, "tasks": ["4.3"] },
    { "id": 16, "tasks": ["4.5"] },
    { "id": 17, "tasks": ["4.6"] },
    { "id": 18, "tasks": ["4.7"] },
    { "id": 19, "tasks": ["4.8"] },
    { "id": 20, "tasks": ["4.9"] },
    { "id": 21, "tasks": ["5.1", "5.3"] },
    { "id": 22, "tasks": ["5.2"] },
    { "id": 23, "tasks": ["5.4"] },
    { "id": 24, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 25, "tasks": ["6.4"] },
    { "id": 26, "tasks": ["7.1"] },
    { "id": 27, "tasks": ["7.2"] }
  ]
}
```

Groups are strictly ordered (G1 → G7); within a group the waves above show which
sub-tasks may proceed in parallel and which gate on an earlier wave. Group 8 is a
reserve and is not in the graph.
