# Dependencies
Every version below is an exact pin: it is the version in every `package.json` and in `pnpm-lock.yaml`. No `^` or `~` ranges are allowed (root `.npmrc` sets `save-exact=true`; `apps/studio/src/__tests__/exact-pins.test.ts` enforces it).

| Package | Version | License | Reason |
| --- | --- | --- | --- |
| zod | 4.6.7 | MIT | Schema source of truth; native `z.toJSONSchema()` (v4) generates JSON Schema. |
| typescript | 5.9.3 | Apache-2.0 | Strict TypeScript compiler for the engine source and scripts. |
| vitest | 5.1.0 | MIT | Unit and property-based test runner. |
| fast-check | 4.10.2 | MIT | Property-based testing with seeded PRNGs. |
| @playwright/test | 1.65.0 | Apache-2.0 | Chromium golden-image visual tests for `drawFrame`. |
| eslint | 10.14.0 | MIT | Purity lint (bans `Math.random`, `Date.now`, `performance.now` in engine src). |
| typescript-eslint | 8.72.1 | MIT | Flat-config TypeScript linting for ESLint 9+. |
| ajv | 8.20.0 | MIT | Validates generated JSON Schema in tests. |
| vite | 8.3.6 | MIT | Dev server for the visual test page. |
| tsx | 4.23.15 | MIT | Runs `generate-schemas.ts` and `generate-visual-fixtures.ts`. |
| @fontsource/noto-sans | 5.3.0 | OFL-1.1 | Self-hosted Latin font for Playwright golden-image visual tests (woff2 copied into tests/visual/fonts). |
| @fontsource/noto-sans-tamil | 5.3.0 | OFL-1.1 | Self-hosted Tamil font for Playwright golden-image visual tests (woff2 copied into tests/visual/fonts). |
| mp4-muxer | 5.2.2 | MIT | Mux encoded H.264 video + AAC audio chunks into an MP4 container, client-side, Worker-safe. |
| client-zip | 2.5.1 | MIT | Package PNG frames into a ZIP (stored entries, per-entry CRC-32) for the PNG-sequence export; small, Worker-safe, no runtime deps. |
| gifenc | 1.0.3 | MIT | Quantize frames to a <=256-color palette and encode an animated GIF (single-color transparency); no runtime deps. |
| react | 19.3.1 | MIT | React UI framework for apps/studio (mandated by steering: Vite + React). Published 2026-10-14. Differs from the indicative spec table (19.2.0): resolved to latest stable at install. |
| react-dom | 19.3.1 | MIT | React DOM renderer for the studio shell. Published 2026-10-14. Differs from the indicative spec table (19.2.0). |
| @vitejs/plugin-react | 6.2.1 | MIT | Vite plugin for React (JSX / dev transform) in apps/studio; compatible with the repo's Vite 8. Published 2026-11-02. Differs from the indicative spec table (6.0.1). |
| @types/react | 19.3.0 | MIT | React type definitions (strict TS) for apps/studio. Published 2026-09-09. Differs from the indicative spec table (19.2.2). |
| @types/react-dom | 19.3.0 | MIT | React DOM type definitions (strict TS) for apps/studio. Published 2026-09-09. Differs from the indicative spec table (19.2.1). |

> **Not added:** `webm-muxer` (5.1.4) was approved for the WebM-with-alpha
> exporter, but that format is deferred in this release (see the exporters
> README "Not in this release"), so the dependency is intentionally NOT
> installed. The three exporter dependencies actually used are `mp4-muxer`,
> `client-zip`, and `gifenc`.

> **apps/studio bundled fonts:** the four self-hosted woff2 files under
> `apps/studio/public/fonts/` (Noto Sans + Noto Sans Tamil, weights 400 and 700)
> are copied from the already-installed `@fontsource/noto-sans@5.3.0` and
> `@fontsource/noto-sans-tamil@5.3.0` packages (OFL-1.1). No network fetch and no
> new dependency were needed; the OFL-1.1 licence text ships alongside them
> (`OFL-Noto-Sans.txt`, `OFL-Noto-Sans-Tamil.txt`).
>
> **apps/studio design-system fonts (no package added):** Instrument Sans (SIL OFL 1.1,
> `InstrumentSans-400-700-latin{,-ext}.woff2`) and DM Mono (SIL OFL 1.1,
> `DMMono-{400,500}-latin{,-ext}.woff2`) are copied from the design-system export into
> `apps/studio/src/ds/fonts/` (not `public/`, so the default dist does not ship them) for the design-system UI (`src/ds/ds.css`) only. Reason: the ported
> design-system components set type in these families. Licence texts are the upstream
> `google/fonts` files (`OFL-Instrument-Sans.txt`, `OFL-DM-Mono.txt`); source URLs, commits and
> dates are recorded in `apps/studio/src/ds/fonts/README.md`. No `@fontsource` package and no
> network fetch at runtime.
