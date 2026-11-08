# Contributing to `@studio/exporters`

This package turns a validated engine `Project` into a downloadable file in the
browser. It owns NO render or schema logic: all pixels come from the engine's
pure `renderFrame`, and all data shapes come from `@studio/engine`. Everything
below keeps the exporters deterministic and each format independently cuttable.

Intra-package imports use ESM paths with explicit `.js` extensions (for example
`import { fail } from "../errors.js"`), even though the sources are TypeScript.

## 1. Directory structure

```
packages/exporters/src/
  index.ts              – public barrel (entry functions, types, DEFAULT_LIMITS)
  api.ts                – public entry functions; dispatch to worker/main
  types.ts, errors.ts   – public types and the typed error/result model
  validate.ts           – option + limit validation
  frame-stepper.ts      – deterministic frame timing
  scale.ts              – R14 uniform output scaling
  capabilities.ts       – runtime capability probing
  render-frame.ts       – the ONE FrameRenderer (blur + scaling); calls renderFrame
  blur/                 – FilterStrippingContext + deterministic box blur
  worker/               – protocol, host loop, dispatch, worker entry, drivers
  muxers/               – thin adapters over container libraries (mp4)
  formats/              – one module per format (mp4, png-seq, gif, deferred)
  audio/                – decode + trim/pad for the AAC track
  types/                – local ambient declarations (e.g. gifenc.d.ts)
  __tests__/helpers/    – hand-written readers for tests (mp4/zip/gif)
tests/visual/           – Playwright specs + the localhost harness app
```

Each `formats/*` module is independently cuttable: a format can be dropped
without touching the others. A new format adds `formats/<id>.ts` (+ `*.test.ts`),
registers a driver in `worker/driver.ts`, and exposes a public entry in `api.ts`.

## 2. `renderFrame` is called in exactly one place

`render-frame.ts` is the ONLY module that may import the engine's `renderFrame`.
It wraps the OffscreenCanvas context in `FilterStrippingContext` (so blur is the
package's own deterministic blur, never the browser's `ctx.filter`) and applies
the R14 uniform scale. Every path — the worker, the main-thread fallback, the
recording driver, and every format driver — renders through `FrameRenderer`.
Importing `renderFrame` anywhere else is an ESLint error (`no-restricted-imports`
in `eslint.config.js`); do not add `eslint-disable`.

## 3. Determinism and ESLint purity rules

Output must be reproducible: the same inputs in the same runtime produce
identical bytes. BANNED in `src/**` (enforced by `no-restricted-properties` in
`eslint.config.js`):

- `Math.random` — all randomness comes from the engine's seeded PRNG.
- `Date.now`
- `performance.now`

No wall-clock in any frame-affecting path (frame stepping, rendering, encode
ordering). The worker's cooperative yield counts frames, it does not read a
clock. Run `pnpm --filter @studio/exporters lint` locally.

## 4. Error model

Every public entry returns an `ExportResult` and NEVER throws. Validate external
input (projects, audio files) and return a typed `ErrorCode` failure with
populated `fieldPaths` where relevant. Throw only for internal invariant
violations; the shared loop maps a thrown encoder error to `encoder-failure`.

## 5. Test requirements

- Unit tests are co-located as `*.test.ts`; integration/visual tests live in
  `tests/visual/`.
- Property-based tests use `fast-check`, run a minimum of 100 iterations, and
  are tagged `// Feature: exporters, Property N: ...`. Run each new property 3×
  before relying on it; on any counterexample, stop and surface it.
- Node-level tests use the engine's `FakeMetricsProvider`. Browser-only behavior
  (WebCodecs, OffscreenCanvas, real containers) is exercised by Playwright specs
  served over the localhost harness in bundled Chromium, parsed by the
  hand-written readers in `src/__tests__/helpers/`.
- A passing `pnpm --filter @studio/exporters exec vitest run` AND
  `pnpm --filter @studio/exporters exec playwright test` are required before merging.

## 6. Dependencies

Runtime dependencies are limited to the approved, exact-pinned set, each with a
row in [`docs/dependencies.md`](../../docs/dependencies.md): `mp4-muxer`,
`client-zip`, `gifenc`. Add a dependency only in the group that first uses it,
MIT/Apache/BSD licensed, pinned to an exact version. `exporters` depends on
`@studio/engine` only; no `tsconfig` change outside this package.

## 7. Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `chore:`, `docs:`, `test:`, `refactor:`, etc. One logical change per
commit; reference the spec task id when the work maps to a spec task. Example:

```
feat(exporters): add animated GIF exporter
```
