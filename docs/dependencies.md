# Dependencies

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
