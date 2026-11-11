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
only; it holds no render, schema, or encoding logic. Group 9 adds the
design-source converter (Requirement 17), the hand-ported design-system
components (Requirement 18), and a dev-only CSP smoke harness, without wiring any
generated screen into the live studio UI.

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

- [x] 4. Group 4: Canvas drag, timeline editing, and undo  *(est. ~22 credits)*
  - [x] 4.1 Store history and gesture API
    - In `apps/studio/src/shell/store.ts` (move to `apps/studio/src/shell/history.ts` only if `store.ts` passes ~200 lines) add `history: Project[]` capped at `HISTORY_LIMIT = 100` (oldest dropped), holding `Project` values only (structurally shared, no copies). `dispatchGuarded` pushes the previous project on an accepted change and adds nothing for a rejected or unchanged (same-reference) action. Add `beginGesture` (commits any open gesture first), `preview` (live, no history, no-op without an open gesture), `commitGesture` (one step iff `project !== base`), `cancelGesture`, `undo` (cancels an open gesture, else pops history), `canUndo`. `setProject` replaces the project and clears history and any gesture. After `undo` and `cancelGesture`, keep `ui.selectedLayerId` if the layer still exists, else `layers[0]?.id ?? null`, and clamp `ui.playhead` to the restored `durationSeconds`. Follow the state table in the design "Undo history and gestures". `undo` during an open gesture cancels it first and adds no step; `cancelGesture` (Escape, `pointercancel`) restores the base and adds no step; `undo` with empty history and no gesture returns `false` and leaves the same `Project` reference. `set-anchor` and `set-layer-timing` in `model/actions.ts` MUST return the same `Project` reference when nothing changed. No typing coalescing. No DOM, no clock.
    - Create `apps/studio/src/shell/store.test.ts` (Vitest, Node, no DOM): the design table row by row, the cap (the 101st push drops the oldest), gesture commit with and without change, cancel (no step), mid-gesture undo (cancels first, no extra step), playhead clamped to the restored duration after `undo`, empty-history `undo` is a no-op with the same `Project` reference and no error, `setProject` clearing history, selection fix-up, and structural sharing (`history[i].canvas === next.canvas` after a layers-only edit). Add unit tests in the model test files that a no-op `set-anchor` and a no-op `set-layer-timing` return the same `Project` reference and add no step through `dispatchGuarded`.
    - Add the fast-check test tagged `// Feature: studio, Property 9: Undo restores` using the existing `arb-project` and action arbitraries interleaved with gesture groups, >= 100 iterations. On any counterexample, STOP and show it before changing a bound, the store, or the property.
    - **Covers:** Requirement 16.1, 16.2, 16.3, 16.5, 16.6, 16.7, 16.8, 16.10, 16.11, 16.12, 16.14, 16.15, 16.16; Design "Undo history and gestures", Property 9
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/shell/store.test.ts` passes, including Property 9 (>= 100 iterations, run 3x with no counterexample).
    - **Note:** Done: reducer no-op detection and structural sharing for every action (`model/transitions.ts`, `model/json-equal.ts`, `model/sharing.test.ts`); Property 10.

  - [x] 4.2 Pure frame-grid timeline math
    - Create `apps/studio/src/model/timeline.ts` (pure; no DOM, no clock) exporting `toFrames` (round-half-away-from-zero), `toSeconds` (rounded to 1e-6), `snapToFrame`, `pxToSeconds` (uses `timemap.xToTime`, snaps, clamps to `[0, toSeconds(N)]` with `N = floor(durationSeconds * fps + 1e-9)`), `dragTiming(kind, start, deltaFrames, fps, durationSeconds)` for `move | start | end`, and `nudgeTiming`. Implement the exact rules in the design "Timeline interaction model": snap on entry, `move` preserves frame length, `start`/`end` keep at least 1 frame, `N < 1` returns the input unchanged, `N = 1` yields `{0, 1/fps}`, non-finite delta is 0. The old `timeline/drag.ts` is not created.
    - Create `apps/studio/src/model/timeline.test.ts`: examples for `toFrames` ties, `toSeconds` rounding, each kind including off-grid input, `N < 1`, `N = 1`, fps change, `nudgeTiming` 1 and 10 frames, and `pxToSeconds`/`snapToFrame`.
    - Add `// Feature: studio, Property 8: Timing drag stays on the frame grid` (frame-grid check `|sec * fps - round(sec * fps)| < 1e-4`, `0 <= start < end <= duration` with `1e-9` slack, `move` length preserved) and extend `timemap.test.ts` so `// Feature: studio, Property 2: Time-pixel round-trip` also covers the pixel round-trip used by `pxToSeconds`. Each >= 100 iterations. Property 3 is satisfied by Property 8. On any counterexample, STOP and show it before changing a formula, a bound, or the property.
    - **Covers:** Requirement 5.1, 5.2, 5.3, 5.10, 10.1; Design "Timeline interaction model", Properties 2, 3, 8
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model` passes; Properties 2 and 8 run >= 100 iterations with no counterexample (run 3x).

  - [x] 4.3 Pure canvas hit testing and drag math
    - Create `apps/studio/src/model/hit.ts` (pure; no DOM, no clock) exporting `Rect`, `layerBounds` (visible clusters only, box `layoutX..layoutX+width` by `layoutY-ASCENT_RATIO*h..layoutY+(1-ASCENT_RATIO)*h` with `export const ASCENT_RATIO = 0.8` and a comment that it is tuned for Noto Sans, shifted by `anchor + transform.positionOffset`, effect scale/rotation/blur/opacity ignored, `null` when no visible cluster), `rectContains`, `hitTest` (last layer first, pad `8 / displayScale`, `displayScale <= 0` or non-finite treated as 1), `clientToCanvas` (`null` for a zero-size rect, no clamping), `dragAnchor` (Shift keeps the dominant axis, tie keeps x; round to `snap ?? 1` before clamping to `[0, w] x [0, h]`), and `nudgeAnchor` (1 px, 10 with Shift, clamped, `null` for non-arrow keys).
    - Create `apps/studio/src/model/hit.test.ts` with the unit cases listed in the design "Unit tests", plus `// Feature: studio, Property 6: Drag identity` and `// Feature: studio, Property 7: Drag stays in canvas and on the grid` with the design arbitraries, each >= 100 iterations. Add a unit test that the hit-only provider's font string equals the painter's `${fontWeight} ${fontSize}px ${fontFamily}` for the same layer style. On any counterexample, STOP and show it before changing a formula, a bound, or the property.
    - Extend `apps/studio/src/__tests__/purity.test.ts` so the purity guard also covers `model/hit.ts` and `model/timeline.ts` (no `Math.random`, `Date.now`, `performance.now`, no DOM globals).
    - **Covers:** Requirement 3.8, 3.9, 3.10, 3.12, 3.13, 3.15, 10.1, 10.4; Design "Canvas hit testing", Properties 6, 7
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/model src/__tests__` passes; Properties 6 and 7 run >= 100 iterations with no counterexample (run 3x); the purity test fails if a banned call is added to `hit.ts` or `timeline.ts`.

  - [x] 4.4 CSS custom property helper and no-inline-style guard
    - Create `apps/studio/src/ui/cssvars.ts` exporting `setCssVars(el, vars)` over a minimal structural element type (`{ style: { setProperty(name, value) } }`): every key must start with `--` and numbers must be finite, otherwise throw a typed `Error`; values are written as `String(value)`.
    - Create `apps/studio/src/ui/cssvars.test.ts` with a fake element (`vi.fn()` for `setProperty`): exact names and stringified values, throws for a name without `--` and for a non-finite number.
    - Add a guard that fails on a JSX `style=` attribute or prop and on `dangerouslySetInnerHTML` in `apps/studio/src/**/*.tsx`: ESLint core `no-restricted-syntax` in `apps/studio/eslint.config.js` with selector `JSXAttribute[name.name='style']` (plus one for `dangerouslySetInnerHTML`), not `eslint-plugin-react`, no new dependency, no static audit test. No `eslint-disable` in `src`.
    - **Covers:** Requirement 11.1, 11.2; Design "CSS custom property helper"
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/ui src/__tests__` passes; `pnpm --filter @studio/app lint` fails on a probe `.tsx` containing `style={{}}` and passes on the existing source.

  - [x] 4.5 Canvas selection, drag, nudge, and overlay in `PreviewCanvas`
    - In `apps/studio/src/preview/PreviewCanvas.tsx` add a hit-only `CanvasMetricsProvider` bound to a detached `document.createElement("canvas")` context, with its own layout cache, recreated in the existing fonts `loadingdone` callback and whenever the canvas size changes; compute the hit `FrameState` with `computeFrameState(project, playhead, { metricsProvider, layoutCache })` on pointerdown and when the overlay refreshes. Never share this provider with the paint renderer or any export.
    - Pointer handling with `setPointerCapture`: primary-button `pointerdown` uses `clientToCanvas` and `hitTest` (empty canvas leaves the selection unchanged; a hit selects the layer, pauses the clock, calls `store.beginGesture()`, focuses the canvas); `pointermove` runs `dragAnchor` (Shift axis lock) and `store.preview({ type: "set-anchor", ... })`; `pointerup` calls `commitGesture`; `pointercancel`, `lostpointercapture` without `pointerup`, and Escape during a drag call `cancelGesture` (no undo step). Without a drag, `pointermove` only toggles the `is-over-layer` class.
    - Keyboard: the canvas has `tabindex="0"`, an `aria-label`, and a focus-visible style in `layout.css`; `keydown` uses `nudgeAnchor` and, when non-null, `preventDefault()` plus `store.dispatchGuarded(set-anchor)` (one step per press); other keys are ignored.
    - Selection outline: a sibling `<div class="selection-outline" aria-hidden="true">` positioned by `setCssVars` (`--x`, `--y`, `--w`, `--h`, CSS px) from the unpadded `layerBounds` times the display scale (the as-built drift guard in `tests/canvas-drag.spec.ts` reads this element: it contains the `#ffcc00` ink within `2 * s` per edge, left/right gaps <= `0.2 * fontSize`, top/bottom gaps <= `0.6 * fontSize`), in `useLayoutEffect`; hidden when nothing is selected, the layer has no bounds, or playback is running. Cursor via classes `is-over-layer` and `is-dragging` in `layout.css`; `touch-action: none` on the canvas. Canvas pixel size and the transparent flag follow `project.canvas` width, height, and background (also after New or Open).
    - **Covers:** Requirement 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 11.2; Design "Canvas interaction model", "Where the bounds come from"
    - **Completion:** `pnpm --filter @studio/app exec tsc --noEmit` and lint pass; `tests/canvas-drag.spec.ts` (task 4.8) passes against this component; the parity probe still reports 0 with a layer selected.

  - [x] 4.6 Timeline component, StudioView wiring, and layout
    - Create `apps/studio/src/timeline/Timeline.tsx`: a ruler with `role="slider"` (`aria-label="Playhead"`, `aria-valuemin`/`aria-valuemax`/`aria-valuenow` in seconds, `aria-valuetext`) that scrubs via `pxToSeconds` on click or drag and with ArrowLeft/Right (1 frame, 10 with Shift); a playhead at the current time; one row per layer with a bar (`move`), a start handle, and an end handle, each focusable with `role="slider"`, an `aria-label` such as `"Title, move"`, and `aria-valuenow`/`aria-valuemin`/`aria-valuemax` in seconds plus `aria-valuetext` like `"1.20 seconds"`. Rows render `aria-disabled` when the duration is under one frame.
    - Pointer drag: `setPointerCapture`, `store.beginGesture()`, select the layer, `deltaFrames` from the pointer-down position each move (not accumulated), `dragTiming`, `store.preview({ type: "set-layer-timing", ... })`; `pointerup` calls `commitGesture` (one step); `pointercancel` calls `cancelGesture`. Arrow keys on a focused part call `nudgeTiming` and `store.dispatchGuarded` (one step per press); other keys ignored. All bar, handle, playhead, and ruler geometry goes through `setCssVars` (`--from`, `--len`, `--at`); no `style` prop. As built, these variables hold PERCENT of the axis and `layout.css` uses `calc(var(--from) * 1%)`, so layout needs no track-width measurement (pointer math still reads the track rect at event time).
    - Wire the component into `apps/studio/src/shell/StudioView.tsx` and add the timeline styles (consuming the CSS variables, focus-visible, reduced-motion) to `apps/studio/src/shell/layout.css`. The Layers panel numeric start/duration inputs stay unchanged.
    - **Covers:** Requirement 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.11, 11.2, 12.6; Design "Timeline component"
    - **Completion:** `pnpm --filter @studio/app exec tsc --noEmit` and lint pass; `tests/timeline.spec.ts` (task 4.8) passes against this component.

  - [x] 4.7 Ctrl/Cmd+Z handler
    - In `apps/studio/src/shell/StudioView.tsx` register one `keydown` listener on `window` (removed on unmount) acting on `(ctrlKey || metaKey) && key.toLowerCase() === "z" && !shiftKey`. Return early, without `preventDefault`, when `event.target` is an `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`, or `isContentEditable`; otherwise `preventDefault()` and `store.undo()` (a mid-gesture press cancels the gesture first and adds no extra step). Return early and do nothing while an export is running (the export dialog owns focus). Escape during a drag calls `store.cancelGesture()`. No redo binding.
    - **Covers:** Requirement 16.2, 16.4, 16.6, 16.10, 16.11, 16.13; Design "Keyboard"
    - **Completion:** typecheck and lint pass; the undo cases in `tests/canvas-drag.spec.ts` and `tests/timeline.spec.ts` (task 4.8) pass, including that Ctrl/Cmd+Z inside a number input does not undo the project and that Ctrl/Cmd+Z while an export is running does nothing.

  - [x] 4.8 Playwright specs for canvas drag, timeline, and undo
    - Create `apps/studio/tests/canvas-drag.spec.ts`: click selects the right layer and an empty click keeps the selection; dragging the title changes the anchor X/Y fields and the `#ffcc00` pixel bounding box follows by the same delta; Shift locks an axis; releasing outside the canvas still commits; the outline overlay matches the bbox; Arrow nudge moves +1 px and Shift+Arrow +10 px, other keys are ignored; Ctrl/Cmd+Z restores the drag and each nudge in one step; Ctrl/Cmd+Z inside a number input does not undo the project; Ctrl/Cmd+Z mid-drag restores the start anchor with no extra undo step; Escape mid-drag restores the start anchor with no undo step; a drift guard compares the hit bounds with the drawn `#ffcc00` pixel bbox.
    - Add a Playwright or unit test (in `apps/studio/tests/undo.spec.ts`, or a unit test of the handler with a fake export state) that Ctrl/Cmd+Z while an export is running does nothing.
    - Create `apps/studio/tests/timeline.spec.ts`: bars map start and width; ruler scrub snaps to frames; dragging a timeline end handle lands the end on a frame (`aria-valuenow * fps` is whole) and changes the duration; Arrow and Shift+Arrow nudge by 1 and 10 frames; slider ARIA attributes; Ctrl/Cmd+Z restores the end-handle drag in one step.
    - Keep the Landing and export specs green; run the CSP spec (`playwright.csp.config.ts`, `tests-csp`) with a canvas drag, a nudge, and a timeline drag added to the session, asserting zero new violations beyond the single named Zod eval probe; assert `await window.__studioExportParity(3)` is exactly 0.
    - **Covers:** Requirement 3.11, 3.12, 3.14, 3.15, 3.16, 3.18, 5.4, 5.6, 5.7, 5.8, 3.19, 3.20, 11.3, 16.2, 16.4, 16.9, 16.10, 16.11, 16.13
    - **Completion:** `pnpm --filter @studio/app exec playwright test tests/canvas-drag.spec.ts tests/timeline.spec.ts` passes; the CSP spec passes with zero new violations; the parity probe returns exactly 0.

  - [x] 4.9 Checkpoint — Group 4
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

- [ ] 9. Group 9: Design-source converter and design-system port  *(est. ~35 credits)*
  - **Stop-and-wait rules for this group.** STOP and ask the owner if:
    - (a) the font licence text or copyright line cannot be verified upstream (never invent a copyright line);
    - (b) `react-dom/server` `renderToStaticMarkup` is unavailable;
    - (c) the converter meets a construct outside the supported grammar in any of the five real files (do not widen the grammar silently; report it with file and line);
    - (d) a property counterexample appears (show it before changing a formula, a bound, or the property);
    - (e) a per-file config rule would be needed beyond the three listed in the design (Landing Page href rewrite, Export Flow review-bar omission, Error States icon-style rewrite). These three are pending owner confirmation (requirements "Deviations" item 3): implement them only if the owner confirmed them in the spec review, otherwise STOP.
  - [ ] 9.1 Fonts and licences
    - Binary-copy `InstrumentSans-400-700-latin(.ext).woff2` (latin and latin-ext) and `DMMono-400/500-latin(-ext).woff2` from the design export into `apps/studio/public/fonts/`; record the sha256 of every copied file in the commit message. Noto Sans Tamil is NOT copied.
    - Obtain the SIL OFL 1.1 text and the copyright lines from the upstream font projects and verify them. If they cannot be verified, STOP (rule a). Add `apps/studio/public/fonts/OFL-Instrument-Sans.txt` and `OFL-DM-Mono.txt` next to the existing OFL files, and one `docs/dependencies.md` row per family (name, licence, source, reason).
    - **Covers:** Requirement 18.2
    - **Completion:** the font files exist under `public/fonts/` and their sha256 values match the export; both OFL files carry upstream-verified copyright lines; `docs/dependencies.md` has a row for Instrument Sans and one for DM Mono.

  - [ ] 9.2 Design-system stylesheet `ds.css`
    - Hand-assemble `apps/studio/src/ds/ds.css`: header comment with export id `f5b901ae-a7fb-489e-9b53-af9bc496124b` and the bundle namespace `MotionTextStudioDesignSystem_f5b901`; `@font-face` rules pointing at `/fonts/...`; tokens scoped under `.ds-root` (not `:root`); `components/ui.css` verbatim; keep the `prefers-reduced-motion` blocks. Never import from `design/`.
    - Create `apps/studio/src/ds/ds.test.ts` asserting: no `:root`; no `url(` except in the `@font-face` sources; every component rule starts with `.ui-` or is an `@keyframes` / `@media` block; each of the 44 token names shared with `src/tokens.css` appears only inside `.ds-root` rules.
    - **Covers:** Requirement 18.1
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/ds/ds.test.ts` passes; `src/tokens.css` is unchanged.

  - [ ] 9.3 Design-system runtime, icons, and helpers
    - Create `apps/studio/src/ds/dc-runtime.ts`: `DcData` / `Scope` types, a safe `get(scope, path)` over objects and arrays that returns `undefined` for a missing segment, a `dcVars` ref-callback helper built on `ui/cssvars.ts` `setCssVars`, and an `asHandler` guard for function-valued bindings. No `any`, no `eval`.
    - Create `apps/studio/src/ds/icons.ts`: exactly the 27 icons listed in design.md (22 static `name=`/`icon=`/`icon-right=` names, plus `clock`, `grid`, `layers` from the data scripts, plus `minus` and `chevron-down`) as typed shape data derived by hand from `ICONS`; no markup strings, no `dangerouslySetInnerHTML`. `viewport` is not an icon.
    - Create `apps/studio/src/ds/helpers.ts` with `stepNumber` and `tokenizeCode`.
    - Create `apps/studio/src/ds/dc-runtime.test.ts`, `icons.test.ts`, `helpers.test.ts`: every referenced icon name exists, exactly 27 icons, `get()` never throws (including for `null`, primitives, and missing segments), `dcVars` writes the expected custom properties, `tokenizeCode` is lossless (joined token text equals the input).
    - **Covers:** Requirement 18.3, 18.4
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/ds` passes for these files; lint passes on `src/ds/`.

  - [ ] 9.4 The 12 design-system components
    - Create `apps/studio/src/ds/index.tsx` exporting Button, Chip, CodeBlock, Icon, IconButton, NumberScrub, ProgressBar, SegmentedControl, Select, Slider, Toast, and Toggle. Markup and `ui-*` classes match `_ds_bundle.js` (read as a reference only, never imported); every control has an accessible name; keyboard focus is visible; dynamic values go through `setCssVars`; Icon renders typed shapes as React SVG children; CodeBlock renders tokenized spans. No JSX `style`, no `dangerouslySetInnerHTML`.
    - Create `apps/studio/src/ds/index.test.tsx` using `react-dom/server` `renderToStaticMarkup`: each component renders its root `ui-*` class; roles and ARIA (for example `role="switch"` with `aria-checked`, `role="progressbar"` values, `role="slider"` values); controlled and uncontrolled basics. Add the static audit of `src/ds/` (no `style=`, `dangerouslySetInnerHTML`, `<script`, `http(s)://`, `design/` import). If `renderToStaticMarkup` is unavailable, STOP (rule b).
    - **Covers:** Requirement 18.3, 18.5
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/ds` passes; `pnpm --filter @studio/app lint` passes on `src/ds/`.

  - [ ] 9.5 Converter core, part 1: tokenizer, tree, structure pass, bindings
    - Create `apps/studio/scripts/dc-convert-lib.mjs` with the strict tokenizer, tree builder, structure pass (drops the `support.js` script, every `text/x-dc` data script, and the `_ds_bundle.js` script inside `<helmet>`), and the `{{ }}` binding parser (dotted path, numeric/boolean/null literal, `$index`). Create `scripts/dc-convert-lib.d.mts`, `scripts/dc-io.mjs` (all file reads/writes for tests and CLI), and `scripts/dc-io.d.mts`. Add `scripts` to the `apps/studio` tsconfig `include`. No `@types/node`, no new dependency.
    - Create `apps/studio/src/__tests__/dc/parse.test.ts`: all five real files parse without error; the structure pass drops the three script kinds; synthetic fail-loud cases (unknown tag, unknown directive, operator inside `{{ }}`, unterminated attribute) throw `DcConvertError` whose message names the file and a line >= 1. If a real file contains a construct outside the grammar, STOP (rule c).
    - **Covers:** Requirement 17.1, 17.3.4, 17.3.10
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/__tests__/dc/parse.test.ts` passes; `tsc --noEmit` passes with the scripts included.

  - [ ] 9.6 Converter core, part 2: style compiler and CSS scoper
    - Extend `scripts/dc-convert-lib.mjs` with the style compiler (static classes shared by stable declaration hash; dynamic declarations as `prop: var(--dc-N)`; mixed values as `calc(var(--dc-N) * 1<unit>)`; `style-hover` / `-focus` / `-active` as `:hover` / `:focus` / `:active` rules) and the CSS scoper (`:where(.dc-<slug>)` prefix, `html` / `body` / `:root` to the root class, `@keyframes` names prefixed `dc-<slug>-`, `@media` / `@container` recursion, specificity guard failing at (0,2,0) or more, `@supports` error).
    - Create `apps/studio/src/__tests__/dc/style.test.ts` and `scope.test.ts` using real excerpts from the design (the quoted examples) and synthetic cases: unit-suffixed binding, object-valued style binding error, selector specificity error, `@supports` error.
    - Add the scoper-check half of Property 12 (balanced braces; every selector under `.dc-<slug>` or `:where(.dc-<slug>)`; keyframes prefix) as example tests here; the property run is in 9.8.
    - **Covers:** Requirement 17.3.1, 17.3.2, 17.3.3, 17.3.13, 17.5; Design Property 12 (partial)
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/__tests__/dc/style.test.ts src/__tests__/dc/scope.test.ts` passes.

  - [ ] 9.7 Converter core, part 3: JSX emitter, config, CLI
    - Extend `scripts/dc-convert-lib.mjs` with the JSX emitter: `sc-if`; `sc-for` keyed by index with `$index`; `x-import` to the ported DS component with camelCased props, `hint-*` dropped, children kept, any other namespace an error; `dc-import` to the `backdrop` slot; `ref` binding and `dc-props` dropping; static `style` on `x-import` to `className`; event attributes bound to function values; HTML and SVG attribute renames (`class`, `for`, `tabindex`, `stroke-width`, `viewBox` kept); `<img>` to an asset import with byte-for-byte asset copy; `<NAME>_BINDINGS` and `<NAME>_KEYFRAMES` exports; header comment with source file name and sha256; typed props `data` and optional `backdrop`; no `any` and no `ts-ignore`.
    - Create `apps/studio/scripts/dc-convert.config.json` and the config loader with `omitIf`, `replaceText`, and `forbid` (default forbid list: the legacy product name `Flash` and remote URLs). Implement the three per-file rules (Landing Page href rewrite, Export Flow review-bar omission, Error States icon-style rewrite) only if the owner confirmed them; otherwise STOP (rule e). Any further rule: STOP (rule e).
    - Create `apps/studio/scripts/dc-convert.mjs` (CLI; non-zero exit and a file:line message on error) and the `dc:convert` script in `apps/studio/package.json`.
    - Create `apps/studio/src/__tests__/dc/emit.test.ts` with unit tests for each mapping on small inputs, plus a `forbid` failure test.
    - **Covers:** Requirement 17.2, 17.3.4–17.3.12, 17.3.14, 17.4, 17.6, 17.7
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/__tests__/dc/emit.test.ts` passes; `pnpm --filter @studio/app dc:convert --help` or a dry run exits 0.

  - [ ] 9.8 Generate, commit, and verify the output
    - Run `pnpm --filter @studio/app dc:convert` for all five screens into `apps/studio/src/generated/` (`<slug>/<PascalName>.tsx`, `<slug>.css`, `assets/`). The folder is committed and never hand-edited.
    - Create `apps/studio/src/__tests__/dc/generated.test.ts`: determinism (convert twice, byte-identical, all five); staleness (in-memory regeneration equals the committed files, including assets); static audit of `generated/` (no `style=`, `dangerouslySetInnerHTML`, `<script`, `http(s)://`, `design/` import path, JSX `style` attribute); `tsc` over `generated/*.tsx`; ESLint over `generated/` and `ds/`.
    - Create `apps/studio/src/__tests__/dc/arb-dc.ts` (the generator described in the design) and add `// Feature: studio, Property 11: Converter determinism` (twice-equal, no hidden state, header sha256 equals input) and `// Feature: studio, Property 12: Generated output is CSP-clean` (throws `DcConvertError` or output free of the forbidden patterns, with its own scan) as fast-check properties, `numRuns: 200` (>= 100), run 3x. The five real files are example cases. On any counterexample, STOP (rule d).
    - **Covers:** Requirement 17.2, 17.6, 17.9; Design Properties 11, 12
    - **Completion:** `pnpm --filter @studio/app exec vitest run src/__tests__/dc` passes 3 times in a row; `git status` is clean after a second `dc:convert` run.

  - [ ] 9.9 Smoke harness and production-leak guard
    - Extract the CSP into a shared module (`apps/studio/csp.ts`) used by `vite.config.ts` and the new harness config. Record a hash of the production `dist/` before the extraction and confirm it is byte-identical after (build hash).
    - Create `apps/studio/dc-harness/index.html` (external module script only, no inline script or style), `main.tsx` (mounts the generated Studio Editor), and `fixture.ts` (static data covering `STUDIO_EDITOR_BINDINGS`); `apps/studio/vite.dc-harness.config.ts` (own output folder, not `dist/`, same CSP injected the same way); `apps/studio/playwright.dc.config.ts`; and `apps/studio/tests-dc/dc-csp.spec.ts` asserting the landmarks render and ZERO `securitypolicyviolation` events and no CSP console errors.
    - Create `apps/studio/src/__tests__/dc/no-leak.test.ts`: `vite build({ write: false })` of the production config emits no path or text matching `design/` (word-boundary guarded), `_ds/`, `_ds_bundle`, `support.js`, `.dc.html`, or `MotionTextStudioDesignSystem`.
    - **Covers:** Requirement 17.10
    - **Completion:** `pnpm --filter @studio/app exec playwright test -c playwright.dc.config.ts` passes with zero violations; the no-leak unit test passes; production `dist` hash is unchanged by the CSP extraction.

  - [ ] 9.10 Documentation
    - Add a root `README.md` section for the converter: the `dc:convert` command, what it reads (`design/*.dc.html`, input only), that output is deterministic, and that `apps/studio/src/generated/` is never edited by hand. Add a note on the design-system port to `apps/studio/README.md`. Add a short `docs/` entry listing the three Deviations pending owner confirmation.
    - **Covers:** Requirement 17.1–17.10 (documentation only)
    - **Completion:** the README section, the `apps/studio/README.md` note, and the docs entry exist and name the command, the input, and the three deviations.

  - [ ] 9.11 Checkpoint — Group 9
    - Run `pnpm --filter @studio/app exec tsc --noEmit`, `pnpm --filter @studio/app lint` (including `generated/` and `ds/`), `pnpm --filter @studio/app exec vitest run`, the studio Playwright suite, the studio CSP spec, and the dc-harness Playwright spec. Confirm export parity is exactly 0 at t = 1, 3, and 5.5 (`await window.__studioExportParity(t)`), `git diff --stat -- packages/` shows no change, `apps/studio/src/tokens.css` is unchanged, and the production `dist/` contains nothing from `design/`.
    - **Completion:** all commands exit 0; parity is exactly 0 at the three times; no change under `packages/`; `tokens.css` unchanged; `dist/` scan clean.
    - Commit: `feat(studio): dc converter and design-system port`

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
- Property 10: No-op detection is exact (Task 4.1)
- Property 11: Converter determinism (Task 9.8)
- Property 12: Generated output is CSP-clean (Task 9.8; scoper example checks in Task 9.6)


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
    { "id": 27, "tasks": ["7.2"] },
    { "id": 28, "tasks": ["9.1", "9.3", "9.5"] },
    { "id": 29, "tasks": ["9.2", "9.4", "9.6"] },
    { "id": 30, "tasks": ["9.7"] },
    { "id": 31, "tasks": ["9.8"] },
    { "id": 32, "tasks": ["9.9"] },
    { "id": 33, "tasks": ["9.10"] },
    { "id": 34, "tasks": ["9.11"] }
  ]
}
```

Groups are strictly ordered (G1 → G7, then G9); within a group the waves above show
which sub-tasks may proceed in parallel and which gate on an earlier wave. Group 8
is a reserve and is not in the graph.
