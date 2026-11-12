# @studio/exporters

Client-side exporters for the studio engine. Renders a validated engine
`Project` to a downloadable file entirely in the browser. This package holds no
render or schema logic of its own: every frame is produced by the engine's pure
`renderFrame`, wrapped so blur and scaling are applied consistently. It depends
on `@studio/engine` only.

## Formats

In product priority order:

| Format | Entry | Status |
| --- | --- | --- |
| MP4 (H.264 + optional AAC) | `exportMp4` | Shipped |
| PNG sequence (ZIP) | `exportPngSequence` | Shipped |
| Animated GIF | `exportGif` | Shipped |
| Animated WebP | `exportWebp` | Shipped |
| WebM with alpha (VP9) | `exportWebmAlpha` | Deferred by owner decision (typed stub) |

Every entry returns a discriminated-union `ExportResult` (`{ ok: true, ... }` or
`{ ok: false, error }`) and NEVER throws; errors are typed by `ErrorCode`.

## Usage

```ts
import { exportMp4, detectCapabilities } from "@studio/exporters";

const caps = await detectCapabilities();
if (caps.mp4.status === "supported") {
  const result = await exportMp4(project, {
    output: { width: 1280, height: 720 }, // optional; defaults to canvas size
    videoBitrate: 8_000_000,              // optional
    backgroundFallback: "#000000",        // solid fill for a transparent project
    audio: { bytes: wavOrMp3Bytes },      // optional AAC track (decoded on main)
    onProgress: (p) => console.log(p.fraction),
    signal: abortController.signal,       // optional cancellation
  });
  if (result.ok) download(result.file, result.fileName);
  else console.error(result.error.code, result.error.message);
}
```

`exportPngSequence(project, options)` produces a ZIP of stored (uncompressed)
PNG entries named `frame_0000.png`, `frame_0001.png`, … (widening past 9999 so
lexical order matches frame order). `exportGif(project, options)` produces a
single animated GIF (per-frame delay `round(100/fps)` cs, palette ≤ 256 colors,
single-color transparency for transparent projects). `exportWebp(project, options)`
produces a single animated WebP: each frame is a still WebP from the browser
(`convertToBlob('image/webp', quality)`, `quality` in `[0, 1]`, default `0.8`), wrapped in a
hand-written RIFF container (`VP8X` + `ANIM` + one `ANMF` per frame; no WebP encoder
package). Frame durations are whole milliseconds that sum to exactly
`durationSeconds * 1000`. A transparent project keeps each frame's alpha (VP8X alpha flag
set); an opaque hex background yields an opaque animation. Where the browser cannot
encode a still WebP it returns `browser-unsupported` before encoding any frame.

## Capabilities

`detectCapabilities()` probes the runtime (WebCodecs `VideoEncoder`/
`AudioEncoder`, a still `image/webp` encode) and returns a `CapabilityReport`
with a `supported` / `unsupported` / `unknown` status per format. It performs no
encode and no network request and completes within ~2 seconds. GIF, PNG
sequence, and the embed target never require a WebCodecs encoder and are always
`supported`. `webp` is reported from the still-WebP probe. `webmAlpha` is always
reported `unsupported` in this release (see "Not in this release").

## Limits

Resource limits are caller-configurable via `options.limits` (merged over
`DEFAULT_LIMITS`): `maxFrames` (18000), `maxPixels` (3840×2160), `maxDurationSeconds`
(600), `maxEncodeQueueSize` (8), `memoryBudgetBytes` (1.5 GiB). Exceeding a hard
limit returns `invalid-options` before any encode; exceeding the memory budget
mid-export returns `out-of-memory`. Imported audio is capped at 50 MB (file) and
600 s / 512 MB (decoded).

## Worker behavior

Exports run on a Web Worker when `Worker` and `OffscreenCanvas` are available,
and fall back to the main thread otherwise — byte-identically. The worker and
main-thread paths share one `runExport` loop (progress once per encoded frame,
monotonic, final fraction exactly 1; cancellation checked at each frame
boundary; encode-queue backpressure; memory budget). Audio is DECODED ON THE
MAIN THREAD (`OfflineAudioContext` is window-only), trim/padded to the project
duration, and the finished PCM is transferred (zero-copy) to the worker for AAC
encoding and muxing. A thrown error inside the worker comes back as a typed
`encoder-failure`, never an unhandled worker error.

## Blur and Safari

The engine paints blur by assigning `ctx.filter = "blur(Npx)"`. Exporters never
rely on the browser's `ctx.filter` for the final output: a `FilterStrippingContext`
intercepts each blurred scope, redirects it to an offscreen layer, and composites
it back through the package's own deterministic, premultiplied-alpha box blur
(three separable passes approximating a Gaussian; area-average downsample +
bilinear upsample above a radius threshold). This keeps blur reproducible across
runtimes and avoids depending on `ctx.filter` support in engines such as Safari,
where canvas `filter` has historically been unreliable. The same `renderFrame`
wrapper applies the R14 uniform output scaling.

## Limitations

- **AAC audio start offset.** The AAC encoder prepends ~2048 priming samples
  (about 46 ms at 44.1 kHz) to every audio track. This package writes no edit
  list to compensate, so in players that do not apply the encoder's priming
  offset the audio can start ~46 ms late relative to the video. The audio track
  END is trimmed to the project duration (priming/tail frames past the end are
  dropped), so the track does not run long; only the START carries the
  uncompensated priming offset.

## Not in this release

One format is deferred by owner decision and ships as a typed stub: `exportWebmAlpha`
exists in the public API and always returns a typed `browser-unsupported` failure;
`detectCapabilities` always reports `webmAlpha` as `unsupported`.

- **WebM with alpha (VP9 `alpha: "keep"`).** Unsupported in the tested Chrome
  configurations (the encoder reports the alpha config as unsupported), so it would
  ship as a permanent "unsupported". No `webm-muxer` dependency is added. Use a PNG
  sequence, or animated WebP, for an alpha-preserving export.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the package layout, per-format
independence, purity rules, and commit conventions.

## Fonts

Pass the fonts your project uses as bytes: `exportMp4(project, { fonts })` (also `exportPngSequence`, `exportGif`).
Each entry is `{ family: string; weight: number | string; data: ArrayBuffer }`.

- The exporter never fetches. Fetch the files yourself (once) and pass the bytes.
- A Worker has its own font set and does not see the page's fonts, so without `fonts` a Worker export
  measures and draws a fallback font and will not match your preview. With `fonts`, both the Worker and
  main-thread paths register the faces before frame 0 and produce the same pixels as the preview.
- Bytes are structured-cloned into the Worker, never transferred, so you can reuse the same buffers for every export.
- On the main thread the exporter removes the faces it added when the export ends; it never removes a face it did not add.
- Errors: bad option shape `invalid-options` (`fieldPaths: ["fonts[i]"]`); a corrupt or over-50 MB font
  `font-decode-failed`; a load that takes over 30 s, or no `FontFace` available, `font-not-ready`.
