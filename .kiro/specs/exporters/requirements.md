# Requirements Document

## Introduction

The exporters feature adds a new workspace package `packages/exporters` (`@studio/exporters`) that renders a validated engine `Project` to downloadable files entirely in the browser. It depends on `packages/engine` only and drives the engine's pure pipeline (`computeFrameState` + `drawFrame` via `renderFrame`); it never contains its own render logic. The package produces, in product priority order, MP4 (H.264 video with optional AAC audio), PNG sequences packaged as ZIP, WebM with alpha (VP9), animated GIF, and animated WebP. Each format is its own requirement so a format can be dropped without touching the others.

Exporting is deterministic: frame `i` is rendered at `t = i / fps` through the same pure engine path the preview and tests use, never from wall-clock time. All export outcomes flow through a discriminated-union result rather than thrown strings, with typed error codes aligned to the Export Flow and Error States design pages. The feature adds no third-party dependency without explicit approval; every candidate is listed in a proposed-dependencies section for the user to approve before design. The design under `design/` is a read-only visual reference: this spec references its error and empty states but never copies its HTML, scripts, or assets into the package, and nothing under `design/` is served by the deployed site.

## Glossary

- **Exporter**: A function in `packages/exporters` that takes a validated `Project` plus format-specific options and produces an `ExportResult`. Each exporter drives the engine via `renderFrame`; it holds no render logic of its own.
- **Project**: The engine's validated top-level document (`ProjectSchema`). Canvas bounds: width 1–7680, height 1–4320, fps 1–120, `durationSeconds` 0.1–600. `background` is a `#rrggbb` hex string or the literal `"transparent"`.
- **FrameState**: The pure data snapshot returned by the engine's `computeFrameState(project, t, opts)`; painted by `drawFrame(ctx, state)`.
- **renderFrame**: The engine's pure composition `renderFrame(project, t, opts)` of `computeFrameState` then `drawFrame`. The single render path shared by preview, every exporter, and all tests.
- **durationSeconds**: The project canvas duration in seconds (0.1–600).
- **fps**: The project canvas frames-per-second (1–120).
- **FrameStepper**: The exporters-internal component that produces frame times `t = i / fps` for `i` in the frame range, draws each frame through `renderFrame`, and feeds the result to the encoder. The only source of frame timing; never reads wall-clock time.
- **Muxer**: A pure-JavaScript component that packages encoded video (and optional audio) chunks into a container file (e.g. MP4). Runs client-side with no network access.
- **WebCodecs VideoEncoder / AudioEncoder**: The browser WebCodecs classes used to encode raw frames to H.264/VP9 and PCM audio to AAC. May be absent in older Safari/Firefox.
- **CapabilityResult**: A typed discriminated value `{ status: "supported" | "unsupported" | "unknown"; ... }` returned by capability detection for a given codec+config, never a thrown error.
- **ExportResult**: The discriminated-union return of every export: a success variant carrying the produced file(s) and summary, or a failure variant carrying an `ExportError`.
- **ExportError / ErrorCode**: A typed error object carrying a stable `code` (an `ErrorCode`) and a human-readable message. `ErrorCode` is a closed string-literal union (see Requirement 10).
- **OffscreenCanvas / Worker path**: The preferred execution path where the FrameStepper and encoders run in a Web Worker using `OffscreenCanvas`. The main-thread path is the fallback when `OffscreenCanvas` or Worker support is unavailable; both paths use the same FrameStepper and produce identical frame output.
- **PNG sequence**: An export that encodes each frame as a PNG and packages all frames into a single ZIP file.
- **WebM alpha (VP9 alpha)**: A WebM container holding VP9 video with a preserved alpha channel, used for see-through titles when the browser can encode it.
- **GIF**: An animated GIF export.
- **WebP**: An animated WebP export.
- **AAC**: Advanced Audio Coding — the audio codec for the optional MP4 audio track.
- **backpressure / encodeQueueSize**: The WebCodecs encoder's count of in-flight encode operations. The FrameStepper bounds `encodeQueueSize` to limit memory use before submitting more frames.
- **AbortSignal cancel**: Cancellation driven by a caller-supplied `AbortSignal`; aborting releases encoders and buffers and leaves no partial file.
- **blur fallback**: The exporter-local DETERMINISTIC blur the exporters package always uses instead of `ctx.filter`, so blurred output does not depend on the browser's filter support. The engine's `drawFrame` is unchanged; the exporter intercepts blur via a draw-surface wrapper (a design-phase spike if the engine draw surface does not permit interception).
- **CapabilityReport**: The aggregate of per-format `CapabilityResult` values, used by the UI to show available formats and the recommended-browser guidance.
- **ExportNote**: A typed, non-error note carried in a successful `ExportResult` summary as `notes: ExportNote[]`. It is a closed string-literal union (initially `mp4-no-transparency`) and is NOT part of `ErrorCode`.
- **backgroundFallback**: An MP4 export option — a `#rrggbb` hex string (default `#000000`) — used as the solid background color when the project `background` is `"transparent"`, since MP4 has no alpha channel.

## Requirements

### Requirement 1: Deterministic Frame Stepping

**User Story:** As a user exporting a project, I want every export to render the exact frames the preview shows, so that the exported file matches what I designed and is reproducible.

#### Acceptance Criteria

1. WHEN the Exporter renders frame index `i`, THE Exporter SHALL render it at time `t = i / fps` (where `fps` is `project.canvas.fps`, in `[1, 120]`) using the engine's pure path (`renderFrame`, i.e. `computeFrameState` then `drawFrame`), and SHALL NOT derive any frame time from `Date.now`, `performance.now`, `requestAnimationFrame`, or any other wall-clock source.
2. THE FrameStepper SHALL compute the total frame count as `round(durationSeconds * fps)` using round-half-away-from-zero (where `durationSeconds` is `project.canvas.durationSeconds`, in `[0.1, 600]`), SHALL render frames for integer indices `i` in the inclusive range `[0, frameCount - 1]` (frame `i = 0` included, frame at index `frameCount` excluded), and SHALL report `frameCount` as the progress total.
3. IF the computed `frameCount` is less than `1`, THEN THE Exporter SHALL render no frame and return a failure `ExportResult` with code `empty-frame-range`, leaving the input `Project` unchanged.
4. WHEN the same `Project` and the same export options are exported twice in one runtime, THE Exporter SHALL produce byte-identical output for every frame index.
5. THE Exporter SHALL construct exactly one text-metrics provider instance for an export and SHALL pass that same instance to every `renderFrame` call of that export, so that layout does not vary across frames.
6. THE Exporter SHALL await font readiness before rendering frame `0`, and WHILE the required fonts are not ready THE Exporter SHALL render no frame.
7. IF the required fonts do not become ready within 30 seconds, THEN THE Exporter SHALL return a failure `ExportResult` with code `font-not-ready`, render no frame, and leave the input `Project` unchanged.
8. THE Exporter SHALL treat the input `Project`, including its nested values, as read-only and SHALL NOT mutate it during export.
9. THE Exporter SHALL treat `project.canvas.fps` as the only frame rate for every format and SHALL NOT accept an independent output `fps`; output size scaling is governed by Requirement 14.

### Requirement 2: MP4 Export (H.264 + optional AAC)

**User Story:** As a user, I want to export my project as an MP4 file with an optional audio track, so that I can share or upload a standard video of my animated title.

#### Acceptance Criteria

1. THE Exporter SHALL export MP4 by encoding frames to H.264 via the WebCodecs `VideoEncoder` and muxing the encoded chunks into an MP4 container with a pure-JavaScript Muxer, with no network access.
2. THE MP4 exporter SHALL accept options for `width`, `height`, and `videoBitrate` (there is no exporter `fps` option; the frame rate is always the project `fps`), and SHALL validate the caller-supplied `width`, `height`, and the project `durationSeconds` against the engine canvas bounds before any dimension rounding: `width` as an integer in `[1, 7680]`, `height` as an integer in `[1, 4320]`, and `durationSeconds` in `[0.1, 600]` seconds inclusive.
3. THE MP4 exporter SHALL validate `videoBitrate` as an integer against the inclusive range `[100000, 100000000]` bits per second (100 kbps to 100 Mbps).
4. IF one or more MP4 options fall outside their validated ranges, THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options` that identifies at least one offending option by name, SHALL evaluate the options in the fixed order `width`, `height`, `durationSeconds`, `videoBitrate` so the identified option is deterministic for the same input, and SHALL NOT start encoding or produce any output file.
5. WHEN a validated MP4 `width` or `height` is an odd integer, THE Exporter SHALL round that dimension up to the next even integer (H.264 requires even dimensions), SHALL then clamp the rounded value to the canvas bound for that dimension so the reported value is an even integer within `[1, 7680]` for `width` and `[1, 4320]` for `height`, and SHALL report the adjusted even dimensions in the success summary.
6. WHERE the user imports exactly one audio track for the MP4, THE Exporter SHALL encode exactly one AAC audio track whose playback length equals the project `durationSeconds` as governed by criteria 7, 8, and 9.
7. IF the decoded duration of the imported audio is shorter than `durationSeconds` by more than the duration of one audio frame, THEN THE Exporter SHALL pad the audio with silence so the encoded AAC track length equals `durationSeconds`.
8. IF the decoded duration of the imported audio is longer than `durationSeconds` by more than the duration of one audio frame, THEN THE Exporter SHALL truncate the audio at `durationSeconds` so the encoded AAC track length equals `durationSeconds`.
9. IF the decoded duration of the imported audio differs from `durationSeconds` by at most the duration of one audio frame, THEN THE Exporter SHALL encode the audio without padding or truncation.
10. WHERE the user enables the silent-audio-track option on a project with no imported audio, THE Exporter SHALL add exactly one silent AAC track whose length equals `durationSeconds`.
11. WHERE the project `background` is `"transparent"` and the target format is MP4, THE Exporter SHALL render the frames onto a solid background whose color is the option `backgroundFallback` (a `#rrggbb` hex string, default `#000000`), and SHALL include the note `mp4-no-transparency` in the success summary `notes` array directing the user to PNG sequence or WebM with alpha for see-through titles.
12. IF the option `backgroundFallback` is provided and is not a valid `#rrggbb` hex string, THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options` that identifies `backgroundFallback` by name, and SHALL NOT start encoding or produce any output file.

### Requirement 3: Capability Detection

**User Story:** As a user on any browser, I want the studio to tell me which export formats work before I start, so that I am offered working options instead of hitting a failure mid-export.

#### Acceptance Criteria

1. WHEN capability detection is invoked for an MP4 or WebM-with-alpha configuration, THE Exporter SHALL query `VideoEncoder.isConfigSupported(config)` and return a `CapabilityResult` with status `supported`, `unsupported`, or `unknown`.
2. IF `VideoEncoder.isConfigSupported(config)` rejects, throws, returns a result that cannot be classified as `supported` or `unsupported`, or does not settle within 2 seconds, THEN THE Exporter SHALL return a `CapabilityResult` with status `unknown` and SHALL NOT propagate the error to the caller.
3. IF the WebCodecs `VideoEncoder` global is absent, THEN THE Exporter SHALL mark only MP4 and WebM with alpha as `unsupported`, and SHALL keep PNG sequence, GIF, and embed available.
4. THE Exporter SHALL always report GIF as `supported` (GIF encoding does not require `VideoEncoder`).
5. THE Exporter SHALL report WebP as `supported` only if the runtime encodes a still WebP frame — probed by requesting an `image/webp` blob from an `OffscreenCanvas`/canvas (`convertToBlob`/`toBlob` with type `image/webp`) and confirming the returned blob's type is `image/webp` — and SHALL report WebP as `unsupported` if the probe rejects or throws, returns null, returns a blob whose type is not `image/webp`, does not settle within 2 seconds, or neither `OffscreenCanvas` nor canvas is available.
6. THE Exporter SHALL detect AAC audio capability as its own `CapabilityResult` by querying `AudioEncoder.isConfigSupported` for AAC; IF `AudioEncoder` is absent or AAC is `unsupported`, THEN MP4 SHALL remain `supported` but the MP4 audio option SHALL be disabled.
7. WHEN an MP4 export is requested with an audio track while AAC capability is `unsupported`, THE Exporter SHALL return a failure `ExportResult` with code `browser-unsupported` before encoding, and SHALL leave the project unchanged.
8. WHEN video encoding is unavailable (no `VideoEncoder`), THE Exporter SHALL produce a `CapabilityReport` that maps to the "video export needs a newer browser" state in which MP4 and WebM are disabled while editing, preview, PNG frames, GIF, and web embeds remain available, carrying the recommended-browser guidance.
9. WHEN a user requests an export for a format whose `CapabilityResult` status is `unsupported`, THE Exporter SHALL return a failure `ExportResult` with code `browser-unsupported`, SHALL NOT encode any frame, and SHALL leave the project unchanged.
10. WHEN capability detection is invoked, THE Exporter SHALL complete detection within 2 seconds, without encoding any export frame, and without issuing any network request.
11. IF any capability probe does not settle within the 2-second detection bound, THEN THE Exporter SHALL resolve that probe's `CapabilityResult` to `unknown` while still reporting GIF as `supported` and, when `VideoEncoder` is absent, MP4 and WebM with alpha as `unsupported`.

### Requirement 4: PNG Sequence Export (ZIP)

**User Story:** As a user who needs transparency or per-frame control, I want to export my project as a ZIP of numbered PNG frames, so that I can import exact frames into other tools.

#### Acceptance Criteria

1. WHEN a PNG sequence export is requested, THE Exporter SHALL render exactly `round(canvas.fps * canvas.durationSeconds)` frames (minimum 1 frame), encode each rendered frame as a PNG, package all frames into a single ZIP file, and report the file count in the success summary (e.g. "ZIP · N files") where N equals the number of encoded PNG entries.
2. THE Exporter SHALL package the ZIP using stored (uncompressed) entries, each written with a CRC-32 checksum computed over that entry's uncompressed PNG bytes, WHERE using compression would otherwise require an additional dependency.
3. WHERE the project `background` is `"transparent"`, THE Exporter SHALL encode each PNG with a preserved alpha channel.
4. WHERE the project `background` is a `#rrggbb` hex value, THE Exporter SHALL encode each PNG with a fully opaque background filled with that color.
5. THE Exporter SHALL name each PNG entry using a zero-padded decimal frame index that is at least 4 digits wide (widening to the digit count of the final frame index when the total frame count exceeds 9999), starting at index 0 for the first rendered frame and incrementing by 1 per frame, so that lexical sorting of entry names matches frame order.
6. IF any frame fails to encode or the ZIP cannot be assembled, THEN THE Exporter SHALL abort the export without producing a partial ZIP file and SHALL return a failure `ExportResult` identifying the failed frame index or the assembly failure.
7. THE Exporter SHALL require no video codec for PNG sequence export, so that PNG sequence export succeeds on browsers without WebCodecs.

### Requirement 5: WebM With Alpha Export (VP9)

**User Story:** As a user making see-through titles, I want to export WebM with a transparent background, so that I can overlay the animation on other content.

#### Acceptance Criteria

1. THE Exporter SHALL export WebM with alpha by encoding frames to VP9 with a preserved alpha channel and muxing into a single WebM file, reporting it as "VP9 · 1 file" in the success summary.
2. WHERE the project `background` is `"transparent"`, THE Exporter SHALL preserve the per-frame alpha of every rendered frame in the encoded VP9 output.
3. WHERE the project `background` is a `#rrggbb` hex color, THE Exporter SHALL encode the WebM over that solid, fully opaque background.
4. WHEN the browser cannot encode VP9 with alpha (its `CapabilityResult` for that configuration is `unsupported`), THE Exporter SHALL return a failure `ExportResult` with code `browser-unsupported` carrying the "this browser can't make WebM with alpha … PNG sequence works here" guidance, SHALL NOT start encoding, and SHALL leave the project unchanged.
5. THE Exporter SHALL expose WebM-with-alpha capability through the `CapabilityReport` so that the UI can show "WebM not available here" before the user starts.

### Requirement 6: Animated GIF Export

**User Story:** As a user, I want to export my project as an animated GIF, so that I can use it where only GIFs are accepted.

#### Acceptance Criteria

1. WHEN an animated GIF export is requested, THE Exporter SHALL build a single animated GIF from the frames rendered through the engine path at times `t = i / fps` (fps in `[1, 120]`, durationSeconds in `[0.1, 600]`) and report it as "GIF · 1 file" in the success summary.
2. THE Exporter SHALL set each GIF frame's delay to `round(100 / fps)` centiseconds and SHALL quantize each frame to a palette of at most 256 colors (the GIF format limit).
3. WHERE the project `background` is `"transparent"`, THE Exporter SHALL produce a GIF with a transparent background using GIF single-color transparency; WHERE the project `background` is a `#rrggbb` hex color, THE Exporter SHALL produce an opaque GIF over that color.
4. WHEN a GIF export is requested while GIF's `CapabilityResult` is `unsupported`, THE Exporter SHALL return a failure `ExportResult` with code `browser-unsupported` and SHALL NOT render or encode any frame.
5. THE Exporter SHALL expose GIF capability through the `CapabilityReport`, and SHALL implement GIF export independently of the other formats so that removing GIF support does not affect MP4, PNG sequence, WebM, or WebP.

### Requirement 7: Animated WebP Export

**User Story:** As a user, I want to export my project as an animated WebP, so that I get a smaller modern file than GIF where WebP is supported.

#### Acceptance Criteria

1. WHEN an animated WebP export is requested, THE Exporter SHALL build a single animated WebP from the frames rendered through the engine path at times `t = i / fps`, containing exactly `round(durationSeconds * fps)` frames (fps in `[1, 120]`, durationSeconds in `[0.1, 600]`), and report it as "WebP · 1 file" in the success summary.
2. WHERE the project `background` is `"transparent"`, THE Exporter SHALL preserve the source alpha of every rendered frame in the WebP output.
3. WHERE the project `background` is a `#rrggbb` hex color, THE Exporter SHALL encode the WebP over that solid, fully opaque background.
4. THE Exporter SHALL expose WebP capability through the `CapabilityReport` with status `supported`, `unsupported`, or `unknown`, derived from the still-WebP frame probe of Requirement 3, without throwing.
5. WHEN a WebP export is requested while WebP's `CapabilityResult` is `unsupported`, THE Exporter SHALL return a failure `ExportResult` with code `browser-unsupported`, SHALL NOT encode any frame, and SHALL produce no partial file.
6. THE Exporter SHALL implement WebP export independently of the other formats so that removing WebP support does not affect MP4, PNG sequence, WebM, or GIF.

### Requirement 8: Safari Blur Fallback

**User Story:** As a user exporting on Safari, I want blurred text to export correctly, so that my exported frames match the preview instead of silently losing the blur.

#### Acceptance Criteria

1. THE Exporter SHALL leave the engine's `drawFrame` unchanged and SHALL implement all blur handling only within the exporters package.
2. THE Exporter SHALL render every blurred segment using an exporter-local blur implementation and SHALL NOT use `ctx.filter` for blur, so that blurred output does not depend on the runtime's `ctx.filter` support.
3. THE Exporter SHALL intercept per-segment blur without modifying the engine — for example by passing the engine a draw-surface wrapper (a `CanvasRenderingContext2D`-shaped object) that ignores assignments to the `filter` property and instead records each segment's effective blur so the exporter can apply its own blur in a post-step — and WHERE the engine's draw surface does not permit this interception mechanism, THE Exporter SHALL resolve the exact mechanism as a design-phase spike while leaving the engine `drawFrame` unchanged in every case.
4. WHEN a `FrameState` segment carries a `blur` value greater than `0` px, THE Exporter SHALL apply the exporter-local blur to that segment so that two export runs given the identical `FrameState` in the identical runtime produce byte-identical blurred output.
5. THE Exporter SHALL include a Chromium CI golden test that renders a project containing at least one segment with `blur` greater than `0` px and asserts that the exporter-local blur output differs from the `ctx.filter`-based reference render by a pixel-diff ratio of at most 0.01.
6. IF the exporter-local blur implementation cannot run in the current runtime, THEN THE Exporter SHALL return a failure `ExportResult` carrying the code `blur-unsupported`, SHALL indicate the failure through that returned result, and SHALL leave the project unchanged.

### Requirement 9: Progress, Cancel, and Memory

**User Story:** As a user, I want to see export progress and cancel a long export, so that I can tell how long it will take and stop it without leaving a broken file behind.

#### Acceptance Criteria

1. WHERE the caller supplies a progress callback, THE Exporter SHALL invoke it at least once per encoded frame with the fraction complete as a number in the inclusive range `[0, 1]`, the current frame index as an integer in the inclusive range `[0, frameCount - 1]`, and the total frame count as a positive integer equal to `frameCount`.
2. WHILE an export runs, THE Exporter SHALL report progress whose fraction at each invocation is greater than or equal to the fraction reported at the immediately preceding invocation.
3. WHEN an export completes successfully, THE Exporter SHALL report a final progress fraction of exactly `1` and a current frame index of exactly `frameCount - 1`.
4. WHERE the caller supplies an `AbortSignal`, WHEN that signal transitions to aborted, THE Exporter SHALL stop rendering before beginning the next frame-encode step, release all encoders and buffers, write no output file, and return a failure `ExportResult` with code `cancelled` within one frame-encode step of the abort.
5. WHILE encoding, THE Exporter SHALL bound the encoder's in-flight `encodeQueueSize` to a configured maximum (default `8`), and IF the number of in-flight encode operations has reached that maximum, THEN THE Exporter SHALL wait until the in-flight count drops below that maximum before submitting another frame.
6. IF the requested `durationSeconds` exceeds the configured `maxDurationSeconds` (default `600`), OR the total frame count exceeds the configured `maxFrames` (default `18000`), OR the output `width` × `height` exceeds the configured `maxPixels` (default `8294400`, i.e. 3840 × 2160), THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options`, SHALL NOT invoke the progress callback, SHALL NOT start encoding, and SHALL write no output file.
7. IF the in-memory footprint of an in-memory-format export exceeds the configured memory budget (default `1.5 GB`) at any point during encoding, THEN THE Exporter SHALL stop encoding, release all encoders and buffers, write no partial or complete output file, and return a failure `ExportResult` with code `out-of-memory`.
8. WHERE `OffscreenCanvas` and Web Worker support are both available, THE Exporter SHALL run the FrameStepper and encoders in a Web Worker, and WHERE either is unavailable, THE Exporter SHALL run the FrameStepper and encoders on the main thread; both paths SHALL use the same deterministic frame stepping and SHALL produce byte-identical frame output for identical project, time, and option inputs.
9. THE Exporter SHALL expose `maxFrames` (default `18000`), `maxPixels` (default `8294400`), `maxDurationSeconds` (default `600`), the maximum `encodeQueueSize` (default `8`), and the memory budget (default `1.5 GB`) as caller-configurable options, each defaulting to its stated value when the caller does not provide it.

### Requirement 10: Typed Result and Error Model

**User Story:** As a studio developer, I want every export to return a typed result with a stable error code, so that the UI can map each outcome to the right message without parsing strings.

#### Acceptance Criteria

1. THE Exporter SHALL return every export outcome as a discriminated-union `ExportResult` with exactly one of a success variant (carrying the produced file or files and a summary) and a failure variant (carrying an `ExportError`), SHALL expose a non-optional discriminant field whose value distinguishes success from failure, and SHALL NOT throw, reject with, or return a bare string from any public API.
2. THE Exporter SHALL define `ErrorCode` as a closed string-literal union whose complete set of values is exactly: `browser-unsupported`, `blur-unsupported`, `cancelled`, `out-of-memory`, `invalid-options`, `audio-decode-failed`, `font-decode-failed`, `font-not-ready`, `empty-frame-range`, `encoder-failure`, `muxer-failure`, and `project-invalid`; adding or removing a value requires a change to this requirement.
3. WHEN an export fails, THE Exporter SHALL return a failure `ExportResult` whose `ExportError` carries exactly one `code` equal to one of the `ErrorCode` union values and a `message` string of length 1 to 500 characters, and WHEN the identical failure condition recurs for the identical input the Exporter SHALL return the identical `code`, so that the UI can select the Export Flow "Export didn't finish" copy from `code` alone without parsing `message`.
4. IF an `ExportError` is returned, THEN THE Exporter SHALL populate its `message` with human-readable text that contains no raw stack trace, no file-system path, and no secret or token value.
5. WHEN an export begins, THE Exporter SHALL validate the input `Project` with the engine's `ProjectSchema` and the supplied export options before rendering frame `0`, and IF `Project` validation fails THEN THE Exporter SHALL return a failure `ExportResult` with code `project-invalid` carrying a non-empty list of the field paths of the problems and SHALL NOT render any frame, and IF the export options fail validation THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options` carrying a non-empty list of the field paths of the problems and SHALL NOT render any frame.
6. THE Exporter SHALL leave the input `Project` deep-equal to its pre-export value on every success and failure path, so that a failed export leaves the project unchanged ("Your project hasn't changed") and a retry re-runs from the same input.
7. THE Exporter SHALL carry informational notes on a SUCCESS result as a `notes: ExportNote[]` array where `ExportNote` is a closed string-literal union (initially `mp4-no-transparency`); notes are not errors and SHALL NOT appear in `ErrorCode`.
8. IF a WebCodecs `VideoEncoder` or `AudioEncoder` surfaces an error through its error callback during encoding, THEN THE Exporter SHALL stop, release all encoders and buffers, produce no partial file, and return a failure `ExportResult` with code `encoder-failure`.
9. WHEN a caller requests cancellation of an in-progress export, THE Exporter SHALL stop rendering within 1 frame of the next frame boundary, release all encoders and buffers, produce no partial file, and return a failure `ExportResult` with code `cancelled`.

### Requirement 11: Security and Privacy

**User Story:** As a privacy-conscious user, I want exporting to stay fully on my device and handle my imported files safely, so that my project and media never leave the browser and a bad file does not crash the studio.

#### Acceptance Criteria

1. WHEN the user supplies an audio or font file whose byte size exceeds 52,428,800 bytes (50 MB), THE Exporter SHALL reject the file before decoding and SHALL return a failure `ExportResult` whose code is `audio-decode-failed` for an audio file or `font-decode-failed` for a font file, leaving the input `Project` unchanged.
2. IF an imported audio file exceeds the 52,428,800-byte (50 MB) size cap or fails to decode, THEN THE Exporter SHALL return a failure `ExportResult` with code `audio-decode-failed`, leave the input `Project` unchanged, and remain able to accept a subsequent export request.
3. IF an imported font file exceeds the 52,428,800-byte (50 MB) size cap or fails to decode, THEN THE Exporter SHALL return a failure `ExportResult` with code `font-decode-failed`, leave the input `Project` unchanged, and remain able to accept a subsequent export request.
4. WHILE performing capability detection, file decoding, or export, THE Exporter SHALL NOT initiate any network request, upload, analytics call, or telemetry call.
5. THE Exporter SHALL NOT use `eval` or the `Function` constructor anywhere in its code path.
6. THE Exporter SHALL produce its output only as in-memory data returned to the caller for download, and SHALL NOT write project data or media to any destination other than that returned result nor transmit it across a network or origin boundary.
7. WHILE decoding imported audio, THE Exporter SHALL return a failure `ExportResult` with code `audio-decode-failed` as soon as the decoded PCM is known or found to exceed either `600` seconds of duration or `512 MB` (536,870,912 bytes) of decoded size, SHALL release any partial decode buffers, SHALL leave the input `Project` unchanged, and SHALL remain able to accept a subsequent export request.
8. WHEN loading an imported font, THE Exporter SHALL load it via `FontFace.load()` with the 30-second readiness timeout of Requirement 1, and IF the font exceeds the 52,428,800-byte (50 MB) size cap or fails to load within that 30-second timeout THEN THE Exporter SHALL return a failure `ExportResult` with code `font-decode-failed`, leave the input `Project` unchanged, and remain able to accept a subsequent export request.

### Requirement 12: Dependency Governance

**User Story:** As a maintainer, I want every new export dependency approved and logged before it ships, so that the bundle stays license-compliant and no surprise dependency is added.

#### Acceptance Criteria

1. THE exporters feature SHALL ensure that every runtime dependency listed in `packages/exporters/package.json` has BOTH a matching entry in `docs/dependencies.md` AND an approval record against a candidate in the "Proposed dependencies" section; a dependency present in `package.json` without both SHALL be treated as a violation.
2. WHERE a dependency is approved, IF the dependency's declared license is not exactly one of MIT, Apache-2.0, or BSD (including BSD-2-Clause and BSD-3-Clause), THEN THE exporters feature SHALL reject the dependency and SHALL indicate the rejection reason as a disallowed license.
3. WHERE a dependency is approved, THE exporters feature SHALL add exactly one corresponding entry to `docs/dependencies.md` containing all four fields: package name, exact pinned version, license identifier, and reason, with no field left empty.
4. THE exporters package SHALL include a `README.md` file at the package root.
5. THE exporters package SHALL declare a dependency on `packages/engine` only, and SHALL declare zero dependencies on `embed`, `studio`, or any consumer of the exporters package.

### Requirement 13: Testability

**User Story:** As a maintainer, I want deterministic, client-side tests for exporting, so that I can trust frame fidelity, option validation, capability handling, and cancellation before merging.

#### Acceptance Criteria

1. THE exporters test suite SHALL render at least one exported frame through the existing Chromium Playwright setup, compare it to the corresponding engine golden PNG, and fail when the pixel diff exceeds `maxDiffPixelRatio: 0.001`.
2. THE exporters test suite SHALL include unit tests asserting that valid options at the inclusive bounds (`width` 1 and 7680, `height` 1 and 4320, `videoBitrate` 100000 and 100000000) are accepted and that values one step outside each bound return a failure `ExportResult` with code `invalid-options` identifying the offending option (there is no exporter `fps` option; the frame rate is always the project `fps`).
3. THE exporters test suite SHALL include a unit test asserting that an odd `width` or `height` is rounded up to the next even value, clamped to the canvas bounds, and reported as the adjusted dimension in the success summary, and a unit test asserting that an output size whose aspect ratio does not match the canvas within 1 pixel returns a failure `ExportResult` with code `invalid-options`.
4. THE exporters test suite SHALL test capability detection with a mocked `VideoEncoder.isConfigSupported` returning each of `supported`, `unsupported`, and `unknown` and asserting the matching `CapabilityResult` status without a thrown error, and SHALL test that WHEN the WebCodecs `VideoEncoder` global is absent MP4 and WebM with alpha are reported `unsupported` while GIF, PNG sequence, and embed remain available.
5. THE exporters test suite SHALL test that, across an export of at least 2 frames, each progress callback's fraction is greater than or equal to the previous callback's fraction and that a successful export reports a final fraction of exactly `1`.
6. THE exporters test suite SHALL test that WHEN the supplied `AbortSignal` is aborted mid-export the exporter stops rendering, releases all encoders and buffers, produces no output file, and returns a failure `ExportResult` with code `cancelled`.
7. THE exporters test suite SHALL include a muxer sanity check that parses the produced MP4 and asserts a frame count equal to `round(durationSeconds * fps)` and a container duration within 1 frame interval (`1 / fps` seconds) of `durationSeconds`.
8. THE exporters test suite SHALL run every test in Chromium with no network access, and SHALL assert that exporting the same `Project` and options twice in one runtime produces byte-identical frame output.
9. THE exporters test suite SHALL run the MP4 and WebM encode tests only in a Chromium that provides H.264 and VP9 encoders, and WHEN the CI Chromium lacks a required encoder THE suite SHALL skip those encode tests with a visible skip reason while still running a mocked-encoder test that does not depend on the real codec.
10. (Verify in design phase) The Playwright-bundled Chromium may lack an H.264 encoder; the design phase SHALL determine whether the test setup needs the `chrome` channel (system Chrome) for the real-encode tests. This task does not change the Playwright configuration.

### Requirement 14: Output Scaling

**User Story:** As a user, I want to export at a size different from my project canvas without distortion or black bars, so that my output fits the target medium while looking exactly like the preview.

#### Acceptance Criteria

1. WHERE the requested output `width`×`height` equals `project.canvas.width`×`project.canvas.height`, THE Exporter SHALL render each frame directly at the project canvas size through the engine with no scaling step applied.
2. WHERE the requested output `width`×`height` differs from `project.canvas.width`×`project.canvas.height`, THE Exporter SHALL render each frame at the project canvas size through the engine and SHALL resample the rendered frame to the output size using a single uniform scale factor equal to `outputWidth / canvasWidth` on both axes, such that the scaled frame exactly fills the output `width`×`height` with no cropping, letterboxing, pillarboxing, or background bars.
3. IF the output aspect ratio does not match the canvas aspect ratio within 1 pixel (i.e. `abs(outputWidth / outputHeight - canvasWidth / canvasHeight)` corresponds to at most a 1-pixel difference on the larger axis), THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options` whose message identifies the aspect-ratio mismatch, SHALL NOT start encoding, and SHALL leave the supplied options unmodified.
4. THE Exporter SHALL constrain the output `width` to the inclusive range `[1, 7680]` and the output `height` to the inclusive range `[1, 4320]` (the engine canvas bounds), and for MP4 SHALL additionally apply the even-dimension rounding-then-clamping rule of Requirement 2.
5. IF the output `width` is outside `[1, 7680]` or the output `height` is outside `[1, 4320]`, THEN THE Exporter SHALL return a failure `ExportResult` with code `invalid-options` whose message identifies the out-of-range dimension, and SHALL NOT start encoding.
6. THE Exporter SHALL apply the scaling rule of criteria 1 and 2 identically for MP4, PNG sequence, WebM with alpha, GIF, and WebP output formats.
7. WHEN the same `Project` and the same output `width`×`height` are exported twice within one runtime, THE Exporter SHALL produce byte-identical scaled frame output for every corresponding frame.

## Proposed dependencies

No dependency is added without explicit approval. Each candidate below must be approved individually; on approval it must also be recorded in `docs/dependencies.md`. Only MIT, Apache-2.0, or BSD licenses are eligible. Sizes are approximate minified footprints and should be re-checked at design time.

| Candidate | Purpose | License (must be MIT/Apache/BSD) | Approx. size | Maintenance | No-dependency alternative |
| --- | --- | --- | --- | --- | --- |
| Pure-JS MP4 muxer (e.g. a fragmented-MP4/WebCodecs muxer) | Package encoded H.264 + AAC chunks into an MP4 container | To confirm (MIT expected) | ~15–40 KB | To confirm actively maintained | Hand-written minimal fragmented-MP4 muxer scoped to H.264 + AAC |
| WebM / EBML muxer | Mux VP9 (+alpha) into a WebM container | To confirm | To confirm | To confirm | Either the MP4 muxer candidate must also mux WebM (choose one muxer for both), or a hand-written minimal EBML/WebM muxer |
| ZIP writer | Package PNG frames into a ZIP for PNG-sequence export | To confirm (MIT expected) | ~10–30 KB | To confirm | Hand-written stored-entry ZIP writer with CRC-32 (no compression) |
| GIF encoder | Quantize and encode frames into an animated GIF | To confirm (MIT/BSD expected) | ~15–30 KB | To confirm | Hand-written palette + LZW GIF encoder |
| WebP encoder | Encode frames into an animated WebP | To confirm (MIT/Apache expected) | ~50–200 KB (often WASM) | To confirm | Encode each frame as a still WebP via canvas `toBlob`/`convertToBlob` (`image/webp`), then wrap the frames in a hand-written RIFF animated-WebP container (VP8X + ANIM + ANMF chunks); a WASM WebP encoder is the dependency option |
| MP4 box parser (devDependency, test only) | Parse the produced MP4 in the Requirement 13.7 sanity test | To confirm | To confirm | To confirm | Minimal hand-written MP4 box reader in the test helpers |

## Out of scope

- Lottie export (deferred; last in product priority).
- AI features of any kind.
- Cloud or server-side rendering.
- Accounts, authentication, or any backend.
- Flash/SWF import or export.
