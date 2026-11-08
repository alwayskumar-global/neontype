# @studio/exporters

Client-side exporters for the studio engine. Renders a validated engine
`Project` to a downloadable file entirely in the browser, driving the engine's
pure render path (`renderFrame`) — this package holds no render logic of its
own and depends on `@studio/engine` only.

Formats (product priority): MP4 (H.264 + optional AAC), PNG sequence (ZIP),
WebM with alpha (VP9), animated GIF, animated WebP.

Status: in progress. See `.kiro/specs/exporters/` for requirements, design, and
the task plan.
