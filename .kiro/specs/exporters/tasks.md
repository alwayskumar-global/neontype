# Implementation Plan: exporters

## Overview

This plan converts the `exporters` design into an ordered series of coding tasks that build `packages/exporters` (`@studio/exporters`) incrementally — from package scaffolding, types, and the error model, through the deterministic frame stepper, capability detection, and exporter-local blur, into the five format exporters (MP4, PNG sequence, GIF, WebM-alpha, WebP in product-priority order), and finally docs plus a workspace-wide checkpoint. Each `formats/*` module is independently cuttable from the end: a format can be dropped without touching the others. Every task names the files it touches, cites the requirement clauses and correctness properties it covers, states a concrete completion check, and is committed once per group with a Conventional Commit message. Every task, including every property-based test, is required. `exporters` depends on `@studio/engine` only; no dependency is added beyond the four approved, exact-pinned packages, and no `tsconfig` outside `packages/exporters` is changed.

---

## Execution rules

- Do not use `Math.random`, `Date.now`, or `performance.now` in any frame-affecting code path (frame stepping, rendering, encoding ordering). The engine supplies determinism; the exporter must not reintroduce wall-clock or nondeterminism. The package `eslint.config.js` bans these three in `src/**` and is the enforcement layer.
- No `eslint-disable` comments in `src`.
- No dependency beyond the four approved, each exact-pinned: `mp4-muxer` 5.2.2, `webm-muxer` 5.1.4, `client-zip` 2.5.1, `gifenc` 1.0.3. `gifenc` ships no types → a local ambient declaration in `packages/exporters/src` (no `@types/*` package, no `tsconfig` change).
- No `tsconfig` changes outside the new `packages/exporters`.
- Stop-and-wait on any property-based-test counterexample: show the user the counterexample before changing a formula, a bound, or the property itself.
- Every public export entry returns an `ExportResult` and never throws; typed errors only.
- `exporters` depends on `@studio/engine` only; it declares zero dependency on `embed`, `studio`, or any consumer.
- Each approved dependency is added — and its `docs/dependencies.md` row written — only in the group that first uses it.

---

## Tasks

- [x] 1. Group 1: Scaffold, core types, error model, limits, and option validation
  - [x] 1.1 Scaffold the `packages/exporters` package
    - Create `packages/exporters/package.json` with `name: "@studio/exporters"`, `"type": "module"`, `"main": "./src/index.ts"`, `"exports"` pointing to `./src/index.ts`, scripts `"lint": "eslint src"` and `"test": "vitest run"`, a `dependency` of `"@studio/engine": "workspace:*"` (and NO other dependency), and dev-dependency placeholders mirroring the engine package: `typescript`, `vitest`, `fast-check`, `@playwright/test`, `eslint`, `typescript-eslint`, `vite`.
    - Create `packages/exporters/tsconfig.json` mirroring `packages/engine/tsconfig.json`: `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"noEmit": true` (no `outDir`), `"include": ["src/**/*"]`.
    - Create `packages/exporters/eslint.config.js` as an ESLint 9 flat config using `typescript-eslint`, with `no-restricted-properties` raising an error for `Math.random`, `Date.now`, and `performance.now` within `files: ["src/**/*.ts"]` (mirror the engine ban list).
    - Create `packages/exporters/vitest.config.ts` with `environment: "node"` and `include: ["src/**/*.test.ts"]`.
    - Create `packages/exporters/README.md` (stub; finalized in Group 8) and `packages/exporters/src/index.ts` as the public barrel (filled by later tasks).
    - The `packages/*` glob in `pnpm-workspace.yaml` already includes `packages/exporters`, so no workspace edit is needed. Add NO dependency here except `@studio/engine`.
    - **Covers:** Requirement 12.4, Requirement 12.5
    - **Completion:** `pnpm install` succeeds and `packages/exporters` resolves as a workspace package; `pnpm --filter @studio/exporters exec tsc --noEmit` passes on the empty barrel.

  - [x] 1.2 Implement the error model and result constructors
    - Create `packages/exporters/src/errors.ts` exporting `ErrorCode` (the closed 12-value string-literal union exactly: `browser-unsupported`, `blur-unsupported`, `cancelled`, `out-of-memory`, `invalid-options`, `audio-decode-failed`, `font-decode-failed`, `font-not-ready`, `empty-frame-range`, `encoder-failure`, `muxer-failure`, `project-invalid`), `ExportNote` (closed union, initially `mp4-no-transparency`), `ExportError` (`{ code: ErrorCode; message: string; fieldPaths?: string[] }`), and result constructors `fail(code, message, fieldPaths?)` and `succeed(...)` that build the discriminated-union `ExportResult`. Messages are clamped/asserted to length `[1, 500]` and carry no stack trace, file-system path, or secret.
    - **Covers:** Requirement 10.1, Requirement 10.2, Requirement 10.3, Requirement 10.4, Requirement 10.5, Requirement 10.7
    - **Completion:** TypeScript compiles `errors.ts`; the `ErrorCode` union has exactly 12 members (asserted in the Group 1 unit tests); `fail`/`succeed` return a value discriminated on `ok`.

  - [x] 1.3 Implement public types, limits, and defaults
    - Create `packages/exporters/src/types.ts` (re-exported from `index.ts`) defining `ExportFormat`, `ExportResult`, `ExportSummary`, `ExportProgress`, `BaseExportOptions`, the per-format option types (`Mp4Options`, `PngSequenceOptions`, `WebmAlphaOptions`, `GifOptions`, `WebpOptions`, `AudioInput`), `ExportLimits`, `DEFAULT_LIMITS` (the Requirement 9 defaults: `maxFrames 18000`, `maxPixels 8294400`, `maxDurationSeconds 600`, `maxEncodeQueueSize 8`, `memoryBudgetBytes 1.5 GiB`), `CapabilityResult`, and `CapabilityReport`.
    - Fill `packages/exporters/src/index.ts` to export only the public surface: the five entry function signatures (implemented in later groups), `detectCapabilities`, `DEFAULT_LIMITS`, and the public types. No internal re-exports.
    - **Covers:** Requirement 2.2, Requirement 9.9, Requirement 10.1, Requirement 10.7
    - **Completion:** `pnpm --filter @studio/exporters exec tsc --noEmit` passes; `index.ts` exports `DEFAULT_LIMITS` equal to the documented defaults.

  - [x] 1.4 Implement option validation
    - Create `packages/exporters/src/validate.ts` exporting option validators: `width` integer `[1, 7680]`, `height` integer `[1, 4320]`, `durationSeconds` `[0.1, 600]`, `videoBitrate` integer `[100000, 100000000]`, evaluated in the fixed order `width, height, durationSeconds, videoBitrate` so the offending option is deterministic; the even-dimension rounding-then-clamping rule for MP4 `width`/`height`; the aspect-ratio-within-1px check; the `backgroundFallback` `#rrggbb` validator; and the hard-limit checks (`maxFrames`, `maxPixels`, `maxDurationSeconds`). Each failure returns `invalid-options` with populated `fieldPaths` and starts no encode.
    - Create `packages/exporters/src/validate.test.ts` with unit tests for the inclusive-bound acceptance and one-step-outside rejection of each option, the fixed evaluation order, odd→even rounding+clamp with the adjusted value reported, the aspect-ratio mismatch rejection, invalid `backgroundFallback`, and an assertion that the `ErrorCode` union has exactly the 12 listed members (closure).
    - **Covers:** Requirement 2.2, Requirement 2.3, Requirement 2.4, Requirement 2.5, Requirement 2.12, Requirement 10.2, Requirement 10.5, Requirement 14.3, Requirement 14.4, Requirement 14.5, Property 3, Property 11
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/validate.test.ts` passes with zero failures.
    - Commit: `feat(exporters): scaffold package with types, error model, limits, and option validation`

  - [x] 1.5 Checkpoint — Group 1
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, and `pnpm --filter @studio/exporters exec vitest run`.
    - **Completion:** All three commands exit with code 0 and zero failures.

- [x] 2. Group 2: Deterministic frame stepper, uniform scaling, and capability detection
  - [x] 2.1 Implement the deterministic frame stepper
    - Create `packages/exporters/src/frame-stepper.ts` computing `frameCount = round(durationSeconds * fps)` with round-half-away-from-zero, yielding frame jobs `{ index, t: index / fps }` for integer indices `[0, frameCount - 1]`, constructing exactly one text-metrics-provider instance per export and passing it to every `renderFrame` call, awaiting font readiness before frame 0 with a 30-second timeout (`font-not-ready` on timeout), and returning `empty-frame-range` when `frameCount < 1`. No `Date.now`/`performance.now`/`requestAnimationFrame` anywhere.
    - Create `packages/exporters/src/frame-stepper.test.ts` with unit tests for the single-metrics-provider identity, the `empty-frame-range` boundary, and the font-not-ready timeout path (mocked clock, no wall-clock in the stepper itself).
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.6, Requirement 1.7, Requirement 1.9, Property 1
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/frame-stepper.test.ts` passes with zero failures.

  - [x] 2.2 Implement uniform output scaling
    - Create `packages/exporters/src/scale.ts` applying a single uniform scale factor `outputWidth / canvasWidth` on both axes when the output size differs from the canvas (no crop, no bars), rendering directly at canvas size when they match, and enforcing the output-size range and aspect-ratio-within-1px rule via `validate.ts` before any scale is applied. Identical rule for all five formats.
    - Add unit tests to `packages/exporters/src/scale.test.ts` for the same-size no-scale path, the uniform scale factor on a differing size, and the aspect-mismatch rejection.
    - **Covers:** Requirement 14.1, Requirement 14.2, Requirement 14.6, Requirement 14.7, Property 4
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/scale.test.ts` passes with zero failures.

  - [x] 2.3 Implement capability detection
    - Create `packages/exporters/src/capabilities.ts` exporting `detectCapabilities(): Promise<CapabilityReport>`: probe `VideoEncoder.isConfigSupported` for MP4 (H.264) and WebM-alpha (VP9 `alpha:"keep"`) and `AudioEncoder.isConfigSupported` for AAC, each resolving to `supported`/`unsupported`/`unknown` (a reject/throw/unclassifiable/2-second-timeout → `unknown`, never propagated); always report GIF `supported`; probe WebP via a still-frame `image/webp` `convertToBlob`; map an absent `VideoEncoder` global to MP4 and WebM-alpha `unsupported` while GIF, PNG sequence, and embed stay available; complete within 2 seconds with no encode and no network request.
    - Add unit tests to `packages/exporters/src/capabilities.test.ts` using a mocked `VideoEncoder`/`AudioEncoder` `isConfigSupported` returning each of `supported`/`unsupported`/`unknown` (and rejecting/hanging), plus the `VideoEncoder`-global-absent case asserting MP4/WebM `unsupported` while GIF/PNG/embed remain available.
    - **Covers:** Requirement 3.1, Requirement 3.2, Requirement 3.3, Requirement 3.4, Requirement 3.5, Requirement 3.6, Requirement 3.7, Requirement 3.8, Requirement 3.9, Requirement 3.10, Requirement 3.11, Requirement 14.2
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/capabilities.test.ts` passes with zero failures.

  - [x] 2.4 Write property-based tests for frame count, determinism, and scaling
    - In `packages/exporters/src/frame-stepper.test.ts`, add a fast-check test tagged `// Feature: exporters, Property 1: Frame count formula` asserting, for `fps` in `[1, 120]` and `durationSeconds` in `[0.1, 600]`, that `frameCount === round(durationSeconds * fps)` (half-away-from-zero) and the rendered index set is exactly `[0, frameCount - 1]`.
    - Add a fast-check test tagged `// Feature: exporters, Property 2: Deterministic rendered-and-scaled frames` asserting that rendering (and scaling, where output size differs) the same frame index twice in one runtime over an `arbValidProject` from `@studio/engine` yields byte-identical output, run against `FakeMetricsProvider`.
    - In `packages/exporters/src/scale.test.ts`, add a fast-check test tagged `// Feature: exporters, Property 4: Uniform scaling with no bars, and aspect/range validation` asserting the equal-axis scale factor and exact fill on aspect-match, and `invalid-options` on aspect-mismatch or out-of-range dimensions. Each property runs a minimum of 100 iterations.
    - **Covers:** Requirement 1.2, Requirement 1.4, Requirement 4.1, Requirement 7.1, Requirement 14.2, Requirement 14.3, Requirement 14.5, Requirement 14.7, Property 1, Property 2, Property 4
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/frame-stepper.test.ts src/scale.test.ts` passes with zero failures.
    - Commit: `feat(exporters): add deterministic frame stepper, uniform scaling, and capability detection`

  - [x] 2.5 Checkpoint — Group 2
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, and `pnpm --filter @studio/exporters exec vitest run`.
    - **Completion:** All three commands exit with code 0 and zero failures.

- [x] 3. Group 3: Exporter-local blur, worker protocol, and main-thread fallback
  - [x] 3.1 Implement the filter-stripping context and exporter-local blur
    - Create `packages/exporters/src/blur/filter-stripping-context.ts` — a `CanvasRenderingContext2D`-shaped wrapper that maintains a `save()`/`restore()` state stack mirroring transform, `globalAlpha`, and `filter`; on a `filter = "blur(Npx)"` assignment with `N > 0` it redirects that scope's draw calls to a full-size offscreen layer and, on the matching `restore()`, composites the layer through the exporter's own deterministic blur honoring the scope `globalAlpha`, then discards it; a blur-0 / `none` / no-filter scope forwards every call unchanged and creates no layer; every created layer is composited-or-discarded on `restore()` and a dangling scope at end-of-frame is flushed safely. It never sets the real `ctx.filter` to paint a browser blur.
    - Create `packages/exporters/src/blur/box-blur.ts` — a deterministic three-pass separable box blur approximating a Gaussian with `sigma = N`, integer-weighted with no runtime-varying math, radius clamped to the engine's `[0, 1000]` bound, with a deterministic downsample-blur-upsample performance cap above a stated radius threshold; returns `blur-unsupported` when it cannot run in the runtime.
    - Create `packages/exporters/src/blur/filter-stripping-context.test.ts` with unit tests for nested `save()`/`restore()` compositing, the blur-0/`none` pass-through (byte-identical call forwarding, no offscreen layer), and the unbalanced/early-exit sequence that must not leak an un-composited or un-restored layer.
    - **Covers:** Requirement 8.1, Requirement 8.2, Requirement 8.3, Requirement 8.4, Requirement 8.6, Property 9
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/blur/filter-stripping-context.test.ts` passes with zero failures.

  - [x] 3.2 Implement the worker protocol and host with main-thread fallback
    - Create `packages/exporters/src/worker/protocol.ts` defining `WorkerOptions` (`BaseExportOptions` without `onProgress`/`signal`), `MainToWorker` (`start`/`abort`), and `WorkerToMain` (`progress`/`result`/`error`) message types.
    - Create `packages/exporters/src/worker/worker-entry.ts` (worker-side harness driving `frame-stepper` + a format encoder) and `packages/exporters/src/worker/host.ts` (bridges `onProgress` and `AbortSignal`: translates `abort` into an `{ type: "abort" }` post and each `progress` message into an `onProgress` call, transfers the produced `Blob`/`ArrayBuffer` back; runs the same stepper + format code inline on the main thread when `OffscreenCanvas` or `Worker` is unavailable, byte-identical to the worker path). Emits progress once per encoded frame, monotonic non-decreasing, final `fraction === 1` and `frame === frameCount - 1`; checks the aborted flag at each frame boundary and returns `cancelled` within one frame-encode step; bounds `encodeQueueSize` to `maxEncodeQueueSize`.
    - Create `packages/exporters/src/worker/host.test.ts` with unit tests for cancel-mid-export (mocked encoder → `cancelled`, buffers released, no file), the backpressure bound, and the memory-budget overflow path (`out-of-memory`), all with a mocked encoder.
    - **Covers:** Requirement 9.1, Requirement 9.2, Requirement 9.3, Requirement 9.4, Requirement 9.5, Requirement 9.7, Requirement 9.8, Requirement 10.9, Property 2, Property 10
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/worker/host.test.ts` passes with zero failures.

  - [x] 3.3 Write property-based tests for blur and progress, and wire the blur golden
    - In `packages/exporters/src/blur/filter-stripping-context.test.ts`, add a fast-check test tagged `// Feature: exporters, Property 9: Exporter-local blur determinism and no-blur pass-through` asserting, for any pixel buffer and blur radius `> 0`, byte-identical blur output in the identical runtime with the real `ctx.filter` never painting a browser blur, and for any blur-0/no-filter scope that every call forwards unchanged with no offscreen layer created.
    - In `packages/exporters/src/worker/host.test.ts`, add a fast-check test tagged `// Feature: exporters, Property 10: Progress is monotonic and final-exact` asserting, for any successful export of at least one frame, non-decreasing progress fractions and a final `fraction === 1` with `frame === frameCount - 1`. Each property runs a minimum of 100 iterations.
    - Create `packages/exporters/tests/visual/blur-golden.spec.ts` (served over the localhost Vite harness in bundled Chromium) that renders a project with at least one segment with `blur > 0` twice — once letting the real `ctx.filter = blur(Npx)` paint (reference) and once through the `FilterStrippingContext` + exporter blur — and asserts the two canvases match within `maxDiffPixelRatio: 0.01`.
    - **Covers:** Requirement 8.1, Requirement 8.2, Requirement 8.3, Requirement 8.4, Requirement 8.5, Requirement 9.2, Requirement 9.3, Property 9, Property 10
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/blur src/worker` passes; `pnpm --filter @studio/exporters exec playwright test tests/visual/blur-golden.spec.ts` passes with zero pixel-diff failures.
    - Commit: `feat(exporters): add filter-stripping blur, worker protocol, and main-thread fallback`

  - [x] 3.4 Checkpoint — Group 3
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, `pnpm --filter @studio/exporters exec vitest run`, and `pnpm --filter @studio/exporters exec playwright test`.
    - **Completion:** All four commands exit with code 0 and zero failures.

- [x] 4. Group 4: MP4 export, muxer sanity, and PNG sequence
  - [x] 4.1 Implement the MP4 muxer adapter and H.264 video exporter
    - Add `mp4-muxer` 5.2.2 to `packages/exporters/package.json` (exact pin) and create `packages/exporters/src/muxers/mp4.ts` as a thin adapter over it.
    - Create `packages/exporters/src/formats/mp4.ts` exporting `exportMp4`: validate `Project` (engine `ProjectSchema`) and options before frame 0, encode frames to H.264 via `VideoEncoder` → the MP4 muxer, round odd dimensions up to even then clamp to canvas bounds (reported in the summary), paint a transparent background over the solid `backgroundFallback` and add the `mp4-no-transparency` note; return an `ExportResult` on every path and never throw.
    - Add a row for `mp4-muxer` (5.2.2, MIT, "Mux encoded H.264 video + AAC audio chunks into an MP4 container, client-side, Worker-safe") to `docs/dependencies.md`.
    - Add unit tests to `packages/exporters/src/formats/mp4.test.ts` for the transparent→fallback note, invalid `backgroundFallback`, and odd→even dimension reporting (mocked encoder).
    - **Covers:** Requirement 2.1, Requirement 2.2, Requirement 2.3, Requirement 2.4, Requirement 2.5, Requirement 2.11, Requirement 2.12, Requirement 12.1, Requirement 12.2, Requirement 12.3
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/mp4.test.ts` passes with zero failures; `docs/dependencies.md` has the `mp4-muxer` row.

  - [x] 4.2 Implement audio decode and trim/pad for the optional AAC track
    - Create `packages/exporters/src/audio/decode.ts` decoding imported audio via `OfflineAudioContext.decodeAudioData` on the main thread, enforcing the 50 MB (52,428,800-byte) untrusted-file cap before decode and the 600-second / 512 MB (536,870,912-byte) decoded-PCM caps (`audio-decode-failed`, buffers released, project unchanged, able to accept a subsequent request).
    - Create `packages/exporters/src/audio/trim-pad.ts` padding with silence when the decoded duration is short by more than one audio frame, truncating when long by more than one audio frame, leaving it unchanged when within one audio frame, and producing a silent track for the `addSilentTrack` option; the encoded AAC length equals `durationSeconds`. Wire one AAC `AudioEncoder` track into `exportMp4`, gated on AAC capability (`browser-unsupported` when requested with audio while AAC is unsupported).
    - Add unit tests to `packages/exporters/src/audio/decode.test.ts` for the size-cap and decoded-cap rejections and the AAC-unsupported-with-audio path.
    - **Covers:** Requirement 2.6, Requirement 2.7, Requirement 2.8, Requirement 2.9, Requirement 2.10, Requirement 3.6, Requirement 3.7, Requirement 11.1, Requirement 11.2, Requirement 11.7
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/audio` passes with zero failures.

  - [x] 4.3 Implement the PNG sequence exporter
    - Add `client-zip` 2.5.1 to `packages/exporters/package.json` (exact pin) and create `packages/exporters/src/formats/png-seq.ts` exporting `exportPngSequence`: render `round(fps * durationSeconds)` frames (minimum 1), encode each as a PNG via `convertToBlob('image/png')`, package into a single ZIP of stored (uncompressed) entries each carrying a CRC-32 over its PNG bytes, name each entry zero-padded to at least 4 digits (widening past 9999) so lexical order matches frame order, report the file count, require no video codec, abort without a partial ZIP on any frame-encode or assembly failure. Preserve alpha for transparent background; fill opaque for a hex background.
    - Add a row for `client-zip` (2.5.1, MIT, "Package PNG frames into a ZIP (stored entries) for the PNG-sequence export; small, Worker-safe, no runtime deps") to `docs/dependencies.md`.
    - Add unit tests to `packages/exporters/src/formats/png-seq.test.ts` for per-background PNG alpha/opacity and partial-ZIP abort on an injected frame failure.
    - **Covers:** Requirement 4.1, Requirement 4.2, Requirement 4.3, Requirement 4.4, Requirement 4.5, Requirement 4.6, Requirement 4.7, Requirement 11.1, Requirement 12.1, Requirement 12.2, Requirement 12.3
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/png-seq.test.ts` passes with zero failures; `docs/dependencies.md` has the `client-zip` row.

  - [x] 4.4 Write property-based tests and the MP4 muxer sanity and real-encode tests
    - Create `packages/exporters/src/__tests__/helpers/mp4-box-reader.ts` — a minimal hand-written MP4 box reader (no MP4 parser package).
    - Add a fast-check test tagged `// Feature: exporters, Property 5: ZIP CRC-32 correctness` to `packages/exporters/src/formats/png-seq.test.ts` asserting, for any byte buffer, the stored-entry CRC-32 equals an independent reference CRC-32.
    - Add a fast-check test tagged `// Feature: exporters, Property 6: PNG entry-name padding and ordering` asserting, for any `frameCount`, every entry name is zero-padded to at least 4 digits (widening past 9999) and lexical order matches numeric frame order.
    - Add a fast-check test tagged `// Feature: exporters, Property 8: AAC track length equals durationSeconds` to `packages/exporters/src/audio/trim-pad.test.ts` asserting, for a decoded duration shorter/longer/within one audio frame of `durationSeconds`, the trimmed/padded PCM length equals `durationSeconds` within one audio frame. Each property runs a minimum of 100 iterations.
    - Create `packages/exporters/tests/visual/mp4-sanity.spec.ts` with a muxer sanity check (mocked encoder emitting canned chunks, parsed by the hand-written box reader) asserting frame count `round(durationSeconds * fps)` and container duration within one frame of `durationSeconds`, plus the PRIMARY-path real MP4 (H.264 + AAC) encode test served over the localhost harness in bundled Chromium (no `chrome` channel, no gating — Spike 4).
    - **Covers:** Requirement 2.7, Requirement 2.8, Requirement 2.9, Requirement 4.2, Requirement 4.5, Requirement 13.1, Requirement 13.7, Requirement 13.8, Requirement 13.9, Requirement 13.10, Property 5, Property 6, Property 8
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/png-seq.test.ts src/audio/trim-pad.test.ts` passes; `pnpm --filter @studio/exporters exec playwright test tests/visual/mp4-sanity.spec.ts` passes with zero failures.
    - Commit: `feat(exporters): add MP4 (H.264+AAC) and PNG-sequence exporters with muxer sanity and real-encode tests`

  - [x] 4.5 Checkpoint — Group 4
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, `pnpm --filter @studio/exporters exec vitest run`, and `pnpm --filter @studio/exporters exec playwright test`.
    - **Completion:** All four commands exit with code 0 and zero failures.

- [x] 5. Group 5: Animated GIF export
  - [x] 5.1 Implement the GIF exporter
    - Add `gifenc` 1.0.3 to `packages/exporters/package.json` (exact pin) and create `packages/exporters/src/types/gifenc.d.ts` — a local ambient declaration (no `@types/*` package, no `tsconfig` change).
    - Create `packages/exporters/src/formats/gif.ts` exporting `exportGif`: build a single animated GIF from engine-rendered frames at `t = i / fps`, set each frame's delay to `round(100 / fps)` centiseconds, quantize each frame to a palette of at most 256 colors, use GIF single-color transparency for a transparent background and an opaque GIF over a hex background, report "GIF · 1 file", and return `browser-unsupported` when GIF capability is `unsupported` (GIF is always reported `supported`, but the guard is wired). Implemented independently of the other formats.
    - Add a row for `gifenc` (1.0.3, MIT, "Quantize and encode frames into an animated GIF") to `docs/dependencies.md`.
    - Add unit tests to `packages/exporters/src/formats/gif.test.ts` for transparent vs hex background and the capability-unsupported → `browser-unsupported` path.
    - **Covers:** Requirement 6.1, Requirement 6.3, Requirement 6.4, Requirement 6.5, Requirement 12.1, Requirement 12.2, Requirement 12.3
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/gif.test.ts` passes with zero failures; `docs/dependencies.md` has the `gifenc` row.

  - [x] 5.2 Write the GIF delay-and-palette property test
    - Add a fast-check test tagged `// Feature: exporters, Property 7: GIF delay and palette bound` to `packages/exporters/src/formats/gif.test.ts` asserting, for `fps` in `[1, 120]`, every GIF frame's delay equals `round(100 / fps)` centiseconds and every frame's quantized palette has at most 256 colors. Runs a minimum of 100 iterations.
    - **Covers:** Requirement 6.2, Property 7
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/gif.test.ts` passes with zero failures.
    - Commit: `feat(exporters): add animated GIF exporter`

  - [x] 5.3 Checkpoint — Group 5
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, and `pnpm --filter @studio/exporters exec vitest run`.
    - **Completion:** All three commands exit with code 0 and zero failures.

- [ ] 6. Group 6: WebM-with-alpha export (capability-gated)
  - [ ] 6.1 Implement the WebM muxer adapter and VP9-alpha exporter
    - Add `webm-muxer` 5.1.4 to `packages/exporters/package.json` (exact pin) and create `packages/exporters/src/muxers/webm.ts` as a thin adapter over it.
    - Create `packages/exporters/src/formats/webm-alpha.ts` exporting `exportWebmAlpha`: encode frames to VP9 with `alpha: "keep"` → the WebM muxer, preserve per-frame alpha for a transparent background and encode over a solid opaque hex background otherwise, report "VP9 · 1 file", and return `browser-unsupported` with PNG-sequence guidance when the VP9-alpha `CapabilityResult` is `unsupported` (no encode started, project unchanged). Implemented independently of the other formats.
    - Add a row for `webm-muxer` (5.1.4, MIT, "Mux VP9 (with alpha) into a WebM container; same author/API family as mp4-muxer") to `docs/dependencies.md`.
    - Add a mocked-encoder mux-path unit test to `packages/exporters/src/formats/webm-alpha.test.ts` (always on) asserting the muxer receives frames and the capability-gated `browser-unsupported` fallback.
    - **Covers:** Requirement 5.1, Requirement 5.2, Requirement 5.3, Requirement 5.4, Requirement 5.5, Requirement 12.1, Requirement 12.2, Requirement 12.3, Property 2
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/webm-alpha.test.ts` passes with zero failures; `docs/dependencies.md` has the `webm-muxer` row.

  - [ ] 6.2 Write the gated WebM-alpha real-encode test
    - Create `packages/exporters/tests/visual/webm-alpha.spec.ts` with a real-encode test GATED behind a runtime `VideoEncoder.isConfigSupported({ codec: "vp09.00.10.08", alpha: "keep", ... })` check, SKIPPED with a visible reason when unsupported (Spike 4 shows VP9 `alpha:"keep"` is unsupported on this Chrome), served over the localhost harness in bundled Chromium. The mocked-encoder unit test from 6.1 remains the always-on layer.
    - **Covers:** Requirement 5.1, Requirement 13.9, Requirement 13.10
    - **Completion:** `pnpm --filter @studio/exporters exec playwright test tests/visual/webm-alpha.spec.ts` passes (the real-encode case is skipped with a visible reason when VP9-alpha is unsupported).
    - Commit: `feat(exporters): add WebM-with-alpha exporter (capability-gated)`

  - [ ] 6.3 Checkpoint — Group 6
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, `pnpm --filter @studio/exporters exec vitest run`, and `pnpm --filter @studio/exporters exec playwright test`.
    - **Completion:** All four commands exit with code 0 and zero failures.

- [ ] 7. Group 7: Animated WebP export
  - [ ] 7.1 Implement the hand-written RIFF container and WebP exporter
    - Create `packages/exporters/src/webp/riff.ts` — a hand-written animated-WebP RIFF container writer emitting VP8X, ANIM, and ANMF chunks (no WebP encoder package).
    - Create `packages/exporters/src/formats/webp.ts` exporting `exportWebp`: encode each engine-rendered frame as a still WebP via canvas `convertToBlob('image/webp')` (the `quality` option feeds the encode), wrap the `round(durationSeconds * fps)` frames in the RIFF container as ANMF frames, preserve source alpha for a transparent background and encode over an opaque hex background otherwise, report "WebP · 1 file", derive WebP capability from the still-WebP probe, and return `browser-unsupported` (no partial file) when WebP capability is `unsupported`. Implemented independently of the other formats.
    - Add unit tests to `packages/exporters/src/formats/webp.test.ts` for the RIFF container structure (VP8X/ANIM/ANMF parse-back), transparent alpha preserved, and the capability-unsupported path.
    - **Covers:** Requirement 7.1, Requirement 7.2, Requirement 7.3, Requirement 7.4, Requirement 7.5, Requirement 7.6, Property 1, Property 2
    - **Completion:** `pnpm --filter @studio/exporters exec vitest run src/formats/webp.test.ts` passes with zero failures.
    - Commit: `feat(exporters): add animated WebP exporter with hand-written RIFF container`

  - [ ] 7.2 Checkpoint — Group 7
    - Run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, and `pnpm --filter @studio/exporters exec vitest run`.
    - **Completion:** All three commands exit with code 0 and zero failures.

- [ ] 8. Group 8: Docs and final checkpoint
  - [ ] 8.1 Finalize the README and dependency log
    - Finalize `packages/exporters/README.md` documenting the public API usage, the five-format list, and the capability notes (MP4/plain-VP9 real-encode primary path, VP9-alpha gated/skipped, GIF always available).
    - Verify `docs/dependencies.md` contains all four rows with name/exact version/license/reason and no empty field: `mp4-muxer` 5.2.2 MIT, `webm-muxer` 5.1.4 MIT, `client-zip` 2.5.1 MIT, `gifenc` 1.0.3 MIT. Add a `CONTRIBUTING`-style note to the README mirroring the engine package's pattern (directory layout, per-format independence, purity rules, Conventional Commits).
    - **Covers:** Requirement 12.1, Requirement 12.2, Requirement 12.3, Requirement 13.8
    - **Completion:** `README.md` documents the public API and format list; `docs/dependencies.md` has all four fully-populated rows.
    - Commit: `docs(exporters): package README, dependency log, and final checkpoint`

  - [ ] 8.2 Run the full workspace suite and confirm no drift
    - Run the root `pnpm test` (whole-workspace typecheck + lint + vitest) AND `pnpm --filter @studio/exporters exec playwright test` (full Playwright suite).
    - Confirm no new dependency beyond the four approved exact-pinned packages (`mp4-muxer` 5.2.2, `webm-muxer` 5.1.4, `client-zip` 2.5.1, `gifenc` 1.0.3) and no `tsconfig` change outside `packages/exporters`.
    - **Covers:** Requirement 11.4, Requirement 12.1, Requirement 12.5
    - **Completion:** Root `pnpm test` exits with code 0 and zero failures; the full Playwright suite passes (VP9-alpha real-encode skipped with a visible reason when unsupported); no dependency beyond the four approved and no `tsconfig` change outside `packages/exporters` is present.

---

## Notes

- No tasks in this plan are optional. Every task, including every property-based test, is required per the spec — there are no `*`-marked sub-tasks.
- Every property-based test is tagged `// Feature: exporters, Property N: …`, runs a minimum of 100 fast-check iterations, and cites the requirement clauses it validates; Node-level property tests run against `FakeMetricsProvider` from `@studio/engine`.
- The only dependencies are the four approved, exact-pinned packages: `mp4-muxer` 5.2.2 (MIT), `webm-muxer` 5.1.4 (MIT), `client-zip` 2.5.1 (MIT), `gifenc` 1.0.3 (MIT). Each is added — and its `docs/dependencies.md` row written — only in the group that first uses it. `gifenc` has no types, so a local ambient declaration lives in `packages/exporters/src/types/gifenc.d.ts` (no `@types/*` package).
- No `tsconfig` change is made outside `packages/exporters`; `exporters` depends on `@studio/engine` only.
- `Math.random`, `Date.now`, and `performance.now` are banned in all `packages/exporters/src/**` files and enforced by the package `eslint.config.js`; no `eslint-disable` in `src`.
- Playwright real-encode tests serve pages over the localhost Vite harness (a secure context) in the bundled Chromium: the MP4 (H.264 + AAC) and plain-VP9 primary paths run ungated; only the VP9-alpha real-encode test is gated behind a runtime `isConfigSupported` check and skipped with a visible reason when unsupported. Mocked-encoder unit tests are the always-on layer underneath.
- Each `formats/*` module is independently cuttable from the end: Groups 5, 6, and 7 (GIF, WebM-alpha, WebP) can be dropped without touching MP4 or PNG sequence.
- On any property-based-test counterexample, stop and show the user before changing a formula, a bound, or the property.
- Per-group checkpoints run `pnpm --filter @studio/exporters exec tsc --noEmit`, `pnpm --filter @studio/exporters lint`, and `pnpm --filter @studio/exporters exec vitest run`, plus `pnpm --filter @studio/exporters exec playwright test` for the groups that add Playwright tests (Group 3's blur golden, Group 4, and Group 6). The final checkpoint (Group 8) runs root `pnpm test` plus the full Playwright suite.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 6, "tasks": ["2.4"] },
    { "id": 7, "tasks": ["2.5"] },
    { "id": 8, "tasks": ["3.1", "3.2"] },
    { "id": 9, "tasks": ["3.3"] },
    { "id": 10, "tasks": ["3.4"] },
    { "id": 11, "tasks": ["4.1", "4.3"] },
    { "id": 12, "tasks": ["4.2"] },
    { "id": 13, "tasks": ["4.4"] },
    { "id": 14, "tasks": ["4.5"] },
    { "id": 15, "tasks": ["5.1"] },
    { "id": 16, "tasks": ["5.2"] },
    { "id": 17, "tasks": ["5.3"] },
    { "id": 18, "tasks": ["6.1"] },
    { "id": 19, "tasks": ["6.2"] },
    { "id": 20, "tasks": ["6.3"] },
    { "id": 21, "tasks": ["7.1"] },
    { "id": 22, "tasks": ["7.2"] },
    { "id": 23, "tasks": ["8.1"] },
    { "id": 24, "tasks": ["8.2"] }
  ]
}
```
