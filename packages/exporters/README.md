# @studio/exporters

Client-side exporters for the studio engine. Renders a validated engine
`Project` to a downloadable file entirely in the browser, driving the engine's
pure render path (`renderFrame`) — this package holds no render logic of its
own and depends on `@studio/engine` only.

Formats (product priority): MP4 (H.264 + optional AAC), PNG sequence (ZIP),
WebM with alpha (VP9), animated GIF, animated WebP.

Status: in progress. See `.kiro/specs/exporters/` for requirements, design, and
the task plan.

## Limitations

- **AAC audio start offset.** The AAC encoder prepends ~2048 priming samples
  (about 46 ms at 44.1 kHz) to every audio track. This package writes no edit
  list to compensate, so in players that do not apply the encoder's priming
  offset the audio can start ~46 ms late relative to the video. The audio track
  END is trimmed to the project duration (priming/tail frames past the end are
  dropped), so the track does not run long; only the START carries the
  uncompensated priming offset.

## Not in this release

Two formats are deferred and ship as typed stubs — `exportWebmAlpha` and
`exportWebp` exist in the public API and always return a typed
`browser-unsupported` failure; `detectCapabilities` always reports `webmAlpha`
and `webp` as `unsupported`.

- **WebM with alpha (VP9 `alpha: "keep"`).** Unsupported in the tested Chrome
  configurations (the encoder reports the alpha config as unsupported), so there
  is no reliable path to ship it yet. Use a PNG sequence for an alpha-preserving
  export in the meantime.
- **Animated WebP.** Requires a hand-written RIFF/VP8X container writer that is
  not implemented in this release. Use GIF for an animated raster export, or MP4
  for video.
