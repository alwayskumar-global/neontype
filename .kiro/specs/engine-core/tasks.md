# Implementation Plan: engine-core

## Overview

This plan converts the `engine-core` design into an ordered series of coding tasks that build `packages/engine` incrementally from package scaffolding through to Playwright visual tests and ESLint enforcement. Each task covers exactly one logical unit of work, references the requirements it satisfies, and states a concrete completion criterion. Every property-based test task is required. Groups are implemented in dependency order so each step can be verified before proceeding.

---

## Tasks

- [x] 1. Group 1: Scaffolding
  - [x] 1.1 Initialise `packages/engine` package structure
    - Create `packages/engine/package.json` with `name: "@studio/engine"`, `"type": "module"`, `"main": "./src/index.ts"`, `"exports"` pointing to `./src/index.ts`, and dev-dependency placeholders for `typescript`, `vitest`, `fast-check`, `@playwright/test`, `eslint`, `typescript-eslint`, `ajv`, and `vite` (the `packages/*` glob in `pnpm-workspace.yaml` already includes this package, so no workspace edit is needed to register it).
    - Create `packages/engine/tsconfig.json` with `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"noEmit": true` (the package is consumed as TypeScript source by Vite and Vitest; no build output — do NOT set `outDir`), and `"include": ["src/**/*", "scripts/**/*"]`.
    - Create `packages/engine/vitest.config.ts` with `environment: "node"`, `include: ["src/**/*.test.ts"]`, and a separate bench include for `src/**/*.bench.ts`.
    - Create all empty directories: `src/schemas/`, `src/effects/typewriter/`, `src/effects/fade-slide/`, `src/testing/fixtures/`, `src/testing/`, `scripts/`, `schema/`, `tests/visual/app/`, `tests/visual/__snapshots__/`, `tests/visual/fixtures/`, `tests/visual/fonts/`.
    - Create `packages/engine/src/index.ts` as an empty barrel file.
    - Create `docs/dependencies.md` at workspace root with the table header row only (columns: Package, Version, License, Reason).
    - **Covers:** Requirement 8.1, Requirement 14.1, Requirement 14.2
    - **Completion:** `pnpm install` succeeds and `packages/engine` resolves as a workspace package.

  - [x] 1.2 Install runtime and dev dependencies
    - Run `pnpm add zod` inside `packages/engine` to install the Zod v4 runtime dependency.
    - Run `pnpm add -D typescript vitest fast-check @playwright/test eslint typescript-eslint ajv vite tsx` to install all dev dependencies.
    - Record exact installed versions in `docs/dependencies.md` for every package (`zod`, `typescript`, `vitest`, `fast-check`, `@playwright/test`, `eslint`, `typescript-eslint`, `ajv`, `vite`, and `tsx`) with columns Package, Version, License, Reason. Record `tsx` with the reason "runs `generate-schemas.ts` and `generate-visual-fixtures.ts`".
    - The `zod-to-json-schema` package MUST NOT appear in `package.json` or `docs/dependencies.md`.
    - **Covers:** Requirement 14.1, Requirement 14.2
    - **Completion:** `pnpm install` passes; `docs/dependencies.md` contains a row for each of the ten packages (`zod`, `typescript`, `vitest`, `fast-check`, `@playwright/test`, `eslint`, `typescript-eslint`, `ajv`, `vite`, `tsx`) with actual installed versions.
    - Commit: `feat(engine-core): scaffold packages/engine with dependencies`

  - [x] 1.3 Approve pnpm dependency build scripts
    - pnpm 10 blocks post-install build scripts by default. Add an `onlyBuiltDependencies` list to `pnpm-workspace.yaml` approving the packages that legitimately need build scripts (e.g. `esbuild`, and any Playwright/Vite native deps that request it).
    - Run `pnpm approve-builds` (or edit `onlyBuiltDependencies` directly) and record in the task which packages were approved.
    - **Covers:** Requirement 14.1
    - **Completion:** `pnpm install` completes without "Ignored build scripts" warnings for the approved packages.

  - [x] 1.4 Configure ESLint flat config (`eslint.config.js`)
    - Create `packages/engine/eslint.config.js` as an ESLint 9 flat-config file using `typescript-eslint`.
    - Configure `no-restricted-properties` to raise an error for `Math.random` (`"Use createPRNG() instead."`), `Date.now` (`"Not allowed in engine/src."`), and `performance.now` (`"Not allowed in engine/src."`) within `files: ["src/**/*.ts"]`.
    - **Covers:** Requirement 13.1
    - **Completion:** Running `pnpm eslint packages/engine/src` on a temporary file that calls `Math.random()` reports an ESLint error; on a clean file reports zero errors.

  - [x] 1.5 Checkpoint — Group 1
    - Run `pnpm install` from workspace root and `pnpm --filter @studio/engine exec tsc --noEmit` to confirm TypeScript resolves the empty barrel.
    - Run `pnpm --filter @studio/engine lint` (zero errors).
    - **Completion:** All commands exit with code 0.

- [ ] 2. Group 2: Errors, PRNG, Easing Primitives
  - [ ] 2.1 Implement typed error classes
    - Create `packages/engine/src/errors.ts` exporting `ParseError extends Error` (`readonly code: "PARSE_ERROR" | "SIZE_LIMIT_EXCEEDED"`, `readonly cause?: unknown`), `MigrationError extends Error` (`readonly code: "FUTURE_VERSION"`, `readonly version: number`), `DuplicateEffectError extends Error` (`readonly effectId: string`), and `InvalidEffectParamsError extends Error` (`readonly effectId: string`, `readonly cause: unknown`).
    - Re-export all four from `src/index.ts`.
    - **Covers:** Requirement 1.7, Requirement 1.8, Requirement 2.3, Requirement 3.2, Requirement 7.2, Requirement 9.5, Requirement 10.5
    - **Completion:** TypeScript compiles `errors.ts` without errors. `instanceof` checks work correctly in a unit test.

  - [ ] 2.2 Implement `createPRNG` (mulberry32 + FNV-1a)
    - Create `packages/engine/src/prng.ts` with `fnv1a32(input: string): number` (32-bit FNV-1a using `Math.imul`), `createPRNG(seed: number): PRNG` (mulberry32 using `Math.imul`; `next()` returns value in `[0, 1)`), and `derivePRNG(seed, layerId, effectInstanceIndex, granularity, segmentIndex): PRNG` (hashes `JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex])` via `fnv1a32`, then calls `createPRNG`).
    - The `PRNG` interface (`{ next(): number }`) is defined and re-exported from this file. `Math.random` MUST NOT be called anywhere in this file.
    - Re-export `createPRNG` and `PRNG` from `src/index.ts`.
    - **Covers:** Requirement 4.1, Requirement 4.2, Requirement 4.3, Requirement 4.4, Requirement 4.5
    - **Completion:** Unit test in `prng.test.ts` asserts `createPRNG(42)` produces the expected first five values against the mulberry32 reference. TypeScript compiles without errors.

  - [ ] 2.3 Write unit tests for `createPRNG`
    - Create `packages/engine/src/prng.test.ts` with: a regression test asserting `createPRNG(42)` produces a known fixed sequence of at least five `next()` values; a test asserting every value is in `[0, 1)`; a test asserting `derivePRNG` called twice with the same arguments returns PRNGs that produce identical first values; a test asserting `derivePRNG` with different `layerId` values produces different first values.
    - **Covers:** Requirement 4.1, Requirement 4.2, Requirement 4.3
    - **Completion:** `pnpm vitest run src/prng.test.ts` passes with zero failures.

  - [ ] 2.4 Write property-based test for PRNG determinism (Property 8)
    - In `packages/engine/src/prng.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 8: PRNG determinism`.
    - For any integer seed `s` (using `fc.integer()`), assert that `createPRNG(s)` called twice produces the same first 10 `next()` values.
    - **Covers:** Requirement 4.2, Requirement 11 — Property 8
    - **Completion:** `pnpm vitest run src/prng.test.ts` passes with zero failures.

  - [ ] 2.5 Write property-based test for PRNG layer independence (Property 17)
    - In `packages/engine/src/prng.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 17: PRNG layer independence`.
    - For any integer `seed`, two distinct non-empty strings `layerA` and `layerB` (via `fc.string({ minLength: 1 })` filtered to be distinct), integer `effectInstanceIndex`, string `granularity`, and integer `segmentIndex`, assert that the first `next()` value of `derivePRNG(seed, layerA, ...)` differs from `derivePRNG(seed, layerB, ...)`.
    - **Covers:** Requirement 11.16 — Property 17
    - **Completion:** `pnpm vitest run src/prng.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement PRNG (mulberry32, FNV-1a) with unit and property tests`

  - [ ] 2.6 Implement easing evaluation
    - Create `packages/engine/src/easing.ts` exporting `evaluate(easing: Easing, a: number, b: number, p: number): number` implementing all six variants: `linear`, `easeIn` (cubic), `easeOut` (cubic), `easeInOut` (cubic), `cubicBezier` (Newton–Raphson or binary search), and `step` (at `p = 1` returns exactly `b`; at `p` in `[0,1)` returns one of exactly `N` discrete values). The output must be a finite number for all valid inputs.
    - **Covers:** Requirement 6.1, Requirement 6.2, Requirement 6.3, Requirement 6.4, Requirement 6.5, Requirement 6.6
    - **Completion:** Unit test in `easing.test.ts` passes: `p=0` returns `a`, `p=1` returns `b` for all easing types; `step` with `steps=4` produces exactly 4 distinct values across `p` in `[0,1)`.

  - [ ] 2.7 Write unit tests for easing
    - Create `packages/engine/src/easing.test.ts` with unit tests for each easing variant: `linear` at `p=0`, `p=0.5`, `p=1`; boundary values for `easeIn`, `easeOut`, `easeInOut`; `cubicBezier` at `p=0` and `p=1`; with control points `(0,0,1,1)` behaves as linear; `step` with `N=4` produces distinct evenly-spaced values at `p=0, 0.25, 0.5, 0.75`; at `p=1` returns exactly `b`.
    - **Covers:** Requirement 6.1, Requirement 6.2, Requirement 6.3, Requirement 6.4, Requirement 6.5, Requirement 6.6
    - **Completion:** `pnpm vitest run src/easing.test.ts` passes with zero failures.

  - [ ] 2.8 Write property-based test for easing invariant (Property 7)
    - In `packages/engine/src/easing.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 7: Easing invariant — finite output`.
    - For any `Easing` value, any `a` and `b` (`fc.float({ noNaN: true, noDefaultInfinity: true })`), and any `p` in `[0, 1]` (`fc.float({ min: 0, max: 1, noNaN: true })`), assert `evaluate(easing, a, b, p)` returns a finite number (no `NaN` or `Infinity`).
    - **Covers:** Requirement 6.5, Requirement 11.3 — Property 7
    - **Completion:** `pnpm vitest run src/easing.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement easing evaluation with unit and property tests`

  - [ ] 2.9 Checkpoint — Group 2
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 3. Group 3: Schemas and Parse / Serialize
  - [ ] 3.1 Implement `EasingSchema`, `KeyframeSchema`, and `KeyframeTrackSchema`
    - Create `packages/engine/src/schemas/keyframe.ts` exporting: `EasingSchema` (Zod union of `"linear"`, `"easeIn"`, `"easeOut"`, `"easeInOut"`, `CubicBezierSchema` with all control points validated to `[0, 1]`, and `StepSchema` with `steps` as positive integer); `KeyframeSchema` (Zod object with `t` non-negative number, `value` union of tuple/number/hex-color, and `easing: EasingSchema`); `KeyframeTrackSchema` (Zod object with `property` union of six property literals and `keyframes` array min 1 max 500, with `.superRefine()` enforcing strictly increasing `t` values and value types matching the declared property).
    - Update `easing.ts` to import the `Easing` type from this file.
    - **Covers:** Requirement 1.3, Requirement 1.4, Requirement 1.5
    - **Completion:** Unit test asserts `KeyframeTrackSchema.safeParse` rejects a track with non-strictly-increasing `t` values and a mismatched value type; accepts a valid track.

  - [ ] 3.2 Implement `EffectInstanceSchema`
    - Create `packages/engine/src/schemas/effect-instance.ts` exporting `EffectInstanceSchema` — Zod object with `effectId` (non-empty kebab-case string), `granularity` (union of `"character"`, `"word"`, `"line"`), and `params` (`z.record(z.unknown())`).
    - **Covers:** Requirement 1.6
    - **Completion:** `EffectInstanceSchema.safeParse` accepts a valid instance and rejects one with an empty `effectId`.

  - [ ] 3.3 Implement `TextLayerSchema`, `ProjectSchema`, and constants
    - Create `packages/engine/src/schemas/project.ts` exporting: `HexColorSchema` (`z.string().regex(/^#[0-9a-fA-F]{6}$/)`), `BackgroundSchema` (union of `HexColorSchema` and `z.literal("transparent")`), `TextLayerSchema` (all fields from Requirement 1.2 with `.superRefine()` for `startSeconds >= 0`, `endSeconds > startSeconds`, and per-keyframe `t <= endSeconds - startSeconds`), and `ProjectSchema` (all fields from Requirement 1.1 with `.superRefine()` for `layer.endSeconds <= canvas.durationSeconds` and keyframe `t` upper bound for every layer).
    - Create `packages/engine/src/schemas/constants.ts` exporting `CURRENT_PROJECT_VERSION = 1`.
    - Re-export all schemas and the constant from `src/index.ts`.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.7, Requirement 1.10, Requirement 1.11, Requirement 1.12, Requirement 1.13
    - **Completion:** Unit tests assert a valid project parses successfully; a layer with `startSeconds >= endSeconds` is rejected; a keyframe with `t > layer.endSeconds - layer.startSeconds` is rejected; a `cubicBezier` with a control point outside `[0, 1]` is rejected.

  - [ ] 3.4 Implement `EffectPackSchema`
    - Create `packages/engine/src/schemas/effect-pack.ts` exporting `EffectPackSchema` — Zod object with all fields from Requirement 3.1, with `.superRefine()` validating each `paramDescriptor.binding.effectInstanceIndex` is within bounds of `effectInstances`. The schema must not invoke `eval` or `Function`.
    - **Covers:** Requirement 3.1, Requirement 3.2, Requirement 3.8, Requirement 3.9, Requirement 3.10
    - **Completion:** `EffectPackSchema.safeParse` rejects a document with an out-of-bounds `effectInstanceIndex` and accepts a valid pack.

  - [ ] 3.5 Implement `serializeProject` and `parseProject`
    - Create `packages/engine/src/serialize.ts` exporting: `serializeProject(project: Project): string` (returns `JSON.stringify(project)`) and `parseProject(json: string): Project | ParseError` (checks `new TextEncoder().encode(json).byteLength > 5_242_880` first returning `ParseError` with `code: "SIZE_LIMIT_EXCEEDED"` without throwing; then calls `ProjectSchema.safeParse(JSON.parse(json))`; returns typed `Project` on success or `ParseError` with `code: "PARSE_ERROR"` on failure; never throws).
    - Re-export both from `src/index.ts`.
    - **Covers:** Requirement 1.8, Requirement 1.9
    - **Completion:** Unit test asserts a round-trip of a known valid project returns a deeply equal object; a 5 MB + 1 byte string is rejected with `code: "SIZE_LIMIT_EXCEEDED"`; malformed JSON is rejected with `code: "PARSE_ERROR"`.

  - [ ] 3.6 Write unit tests for schemas and serialization
    - Create `packages/engine/src/schemas/project.test.ts` and `packages/engine/src/serialize.test.ts` with comprehensive unit tests covering: valid project fixture passes `ProjectSchema.safeParse`; various invalid fixtures (missing required fields, out-of-range values, cross-field violations) each return `{ success: false }`; `serializeProject` → `parseProject` round-trip returns deeply equal value; size-limit boundary (exactly 5,242,880 bytes passes; 5,242,881 bytes returns `SIZE_LIMIT_EXCEEDED`); `EffectPackSchema` rejects out-of-bounds `effectInstanceIndex`.
    - **Covers:** Requirement 1.7, Requirement 1.8, Requirement 1.12, Requirement 1.13, Requirement 3.2, Requirement 3.6, Requirement 3.10
    - **Completion:** `pnpm vitest run src/schemas/project.test.ts src/serialize.test.ts` passes with zero failures.

  - [ ] 3.7 Build core fast-check arbitraries
    - Create `packages/engine/src/testing/arbitraries.ts` exporting the CORE generators: `arbHexColor`, `arbEasing`, `arbKeyframe(property)`, `arbKeyframeTrack`, `arbTextLayer(canvasDuration)` (WITHOUT effectInstances for now — layers generate an empty `effectInstances: []`), `arbValidProject` (WITHOUT effect instances), `arbOutOfBoundsProject`, `arbValidEffectPack`, and `arbT(project)`. Generators must satisfy all cross-field Zod constraints (keyframe `t` range, `endSeconds > startSeconds`, numeric range limits on anchor/positionOffset/fontSize/letterSpacing/lineHeight).
    - Create `packages/engine/src/testing/arbitraries.test.ts` with a smoke test: `fc.assert(fc.property(arbValidProject, p => ProjectSchema.safeParse(p).success))` and the same for `arbValidEffectPack` — assert every generated value passes `safeParse`.
    - **Covers:** Requirement 11.7
    - **Completion:** `pnpm vitest run src/testing/arbitraries.test.ts` passes with zero failures.

  - [ ] 3.8 Write property-based test for project serialize/parse round-trip (Property 1)
    - In `packages/engine/src/serialize.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 1: Project serialize/parse round-trip`.
    - Using `arbValidProject`, assert that `parseProject(serializeProject(p))` returns a value deeply equal to `p` for any valid `Project`.
    - **Covers:** Requirement 1.9, Requirement 11.4 — Property 1
    - **Completion:** `pnpm vitest run src/serialize.test.ts` passes with zero failures.

  - [ ] 3.9 Write property-based test for EffectPack JSON round-trip (Property 2)
    - In `packages/engine/src/schemas/effect-pack.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 2: EffectPack JSON round-trip`.
    - Using `arbValidEffectPack`, assert that `EffectPackSchema.safeParse(JSON.parse(JSON.stringify(ep)))` succeeds and produces a value deeply equal to `ep` for any valid `EffectPack`.
    - **Covers:** Requirement 3.6, Requirement 11 — Property 2
    - **Completion:** `pnpm vitest run src/schemas/effect-pack.test.ts` passes with zero failures.

  - [ ] 3.10 Write property-based test for hard-limits rejection (Property 12)
    - In `packages/engine/src/schemas/project.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 12: Hard-limits rejection`.
    - Using `arbOutOfBoundsProject` (generates project-like objects where at least one of canvas dimensions, fps, durationSeconds, layer count, text length, keyframe count, or effect-instance count exceeds defined hard limits), assert that `ProjectSchema.safeParse` returns `{ success: false }` and does not throw.
    - **Covers:** Requirement 11.11 — Property 12
    - **Completion:** `pnpm vitest run src/schemas/project.test.ts` passes with zero failures.

  - [ ] 3.11 Write property-based test for invalid-input rejection (Property 13)
    - In `packages/engine/src/schemas/project.test.ts`, add a fast-check property-based test tagged `// Feature: engine-core, Property 13: Invalid-input rejection is safe`.
    - Using `fc.anything()`, assert that `ProjectSchema.safeParse` returns `{ success: false }` and does not throw for any JSON value that is not a valid `Project`.
    - **Covers:** Requirement 11.6 — Property 13
    - **Completion:** `pnpm vitest run src/schemas/project.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement schemas, serialization, and PBTs (Properties 1, 2, 12, 13)`

  - [ ] 3.12 Checkpoint — Group 3
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 4. Group 4: Migration
  - [ ] 4.1 Implement `migrateProject` and `MigrationMap`
    - Create `packages/engine/src/migrate.ts` exporting `MigrationFn`, `MigrationMap` types, and `migrateProject(raw: unknown, migrations?: MigrationMap): Project | MigrationError`: reads `schemaVersion` from raw; if `> CURRENT_PROJECT_VERSION` returns `MigrationError` without throwing; if equal runs `ProjectSchema.safeParse` directly; if less applies each migration step from version N to `CURRENT_PROJECT_VERSION` in order (using `migrations` map override when provided). Since `CURRENT_PROJECT_VERSION` is `1`, the initial implementation handles `schemaVersion === 1` and `schemaVersion > 1`.
    - Re-export `migrateProject`, `MigrationFn`, `MigrationMap` from `src/index.ts`.
    - **Covers:** Requirement 2.1, Requirement 2.2, Requirement 2.3, Requirement 2.4, Requirement 2.6
    - **Completion:** Unit test asserts `migrateProject` with `schemaVersion > CURRENT_PROJECT_VERSION` returns a `MigrationError`; with a valid version-1 document returns a valid `Project`.

  - [ ] 4.2 Create synthetic version-1 fixture and fixture migration tests
    - Create `packages/engine/src/testing/fixtures/project-v1.json` — a minimal but complete committed JSON fixture at `schemaVersion: 1` satisfying all `ProjectSchema` constraints (at least one layer, one keyframe track, one effect instance).
    - Create `packages/engine/src/migrate.test.ts` with: a test that reads `project-v1.json`, calls `migrateProject`, and asserts the result passes `ProjectSchema.safeParse`; a test exercising `migrateProject` with a custom `MigrationMap` for synthetic version-0 → version-1 migration; a test asserting `migrateProject({ schemaVersion: 999 })` returns a `MigrationError` with `code: "FUTURE_VERSION"`.
    - **Covers:** Requirement 2.5, Requirement 11.5
    - **Completion:** `pnpm vitest run src/migrate.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement migrateProject with fixtures and migration tests`

  - [ ] 4.3 Checkpoint — Group 4
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 5. Group 5: Metrics Providers and Segmentation / Layout
  - [ ] 5.1 Implement `TextMetricsProvider` interface, `FakeMetricsProvider`, and `CanvasMetricsProvider`
    - Create `packages/engine/src/metrics.ts` exporting: `FontSpec` interface (`{ fontFamily, fontSize, fontWeight, letterSpacing }`), `TextMetricsProvider` interface (`{ measure(text, fontSpec): { width, ascent, descent } }`), `FakeMetricsProvider` (deterministic test double: `width = text.length * fontSize * 0.6`, `ascent = fontSize * 0.8`, `descent = fontSize * 0.2`; no DOM access), and `CanvasMetricsProvider` class (backed by `CanvasRenderingContext2D.measureText`; used in browser contexts only).
    - Re-export all from `src/index.ts`.
    - **Covers:** Requirement 5.1, Requirement 11.1, Requirement 12.4
    - **Completion:** TypeScript compiles `metrics.ts` without errors. Unit test asserts `FakeMetricsProvider.measure("Hello", { fontFamily: "sans-serif", fontSize: 16, fontWeight: "400", letterSpacing: 0 })` returns `{ width: 48, ascent: 12.8, descent: 3.2 }`.

  - [ ] 5.2 Implement grapheme-cluster segmentation (`segment.ts`)
    - Create `packages/engine/src/segment.ts` exporting `SegmentToken` interface (`{ text, charIndex, wordIndex, lineIndex }`) and `segmentText(text: string): SegmentToken[]` using `Intl.Segmenter` with `granularity: "grapheme"`. Assigns `charIndex` (0-based, increments per cluster including `\n`), `wordIndex` (0-based word index; `\n` inherits the preceding wordIndex or `0`), and `lineIndex` (incremented after each `\n`; the `\n` cluster itself takes the current lineIndex). The `\n` cluster appears in the output with its own `SegmentToken`.
    - **Covers:** Requirement 5.9, Requirement 11.12
    - **Completion:** Unit tests assert: for `"ab\ncd"`, charIndexes are `[0,1,2,3,4]` and lineIndexes are `[0,0,0,1,1]`; for a ZWJ emoji sequence, the entire sequence is a single `SegmentToken`.

  - [ ] 5.3 Implement layout geometry computation with memoization (`layout.ts`)
    - Create `packages/engine/src/layout.ts` exporting `LayoutGeometry` interface (`{ layoutX, layoutY, width, height }`) and `layoutSegments(tokens, layer, metricsProvider, cache): LayoutGeometry[]`. Cache key is `JSON.stringify([layer.text, layer.fontFamily, layer.fontSize, layer.fontWeight, layer.letterSpacing, layer.lineHeight, layer.maxWidth])`. Cache hit: return stored array directly. Cache miss: compute per-cluster layout (advance `layoutX` by `width + letterSpacing`; break to new line when `layoutX + nextWidth > maxWidth` or at `\n`; `layoutY` advances by `fontSize * lineHeight` per line), freeze each `LayoutGeometry` object (`Object.freeze`), insert into cache. Origin `(0,0)` is the top-left of the first character.
    - **Covers:** Requirement 5.9, Requirement 15.1, Requirement 15.2
    - **Completion:** Unit test asserts identical layer params with a warm cache skip calling `metricsProvider.measure`; layout of `"ab"` produces two segments with `layoutX[1] = layoutX[0] + width[0] + letterSpacing`.
    - Commit: `feat(engine-core): implement metrics providers, segmentation, and layout with cache`

  - [ ] 5.4 Checkpoint — Group 5
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 6. Group 6: Keyframe Interpolation
  - [ ] 6.1 Implement `interpolateTrack`
    - Create `packages/engine/src/interpolate.ts` exporting `interpolateTrack(track: KeyframeTrack, tLocal: number): KeyframeValue`: for `tLocal` before the first keyframe returns the first value; after the last returns the last value; otherwise calls `evaluate(keyframe.easing, a, b, p)` where `p = (tLocal - kf_i.t) / (kf_{i+1}.t - kf_i.t)`. For `color` tracks, interpolate per-channel sRGB: parse each hex color to R, G, B integers; interpolate each channel in `[0, 255]`; round to nearest integer (standard half-up); re-encode as `#rrggbb`.
    - **Covers:** Requirement 5.11, Requirement 1.11
    - **Completion:** Unit tests assert: at `tLocal` before first keyframe returns first value; after last keyframe returns last value; at exact keyframe boundary returns that keyframe's value; color track interpolation at midpoint of `#000000` → `#ffffff` returns the documented expected value.

  - [ ] 6.2 Write unit tests for keyframe interpolation
    - Create `packages/engine/src/interpolate.test.ts` with: tests for before-first, after-last, and at-exact-boundary conditions for a numeric track; test for `color` track at `p=0.5` between `#000000` and `#ffffff` asserting correct per-channel rounding; test for `position` track returning a `[number, number]` tuple at an interpolated time; test for `step` easing returning exactly `N` discrete values across the interval.
    - **Covers:** Requirement 5.11, Requirement 1.11, Requirement 6.1, Requirement 6.2, Requirement 6.3, Requirement 6.4, Requirement 6.6
    - **Completion:** `pnpm vitest run src/interpolate.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement keyframe interpolation with color channel math`

  - [ ] 6.3 Checkpoint — Group 6
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 7. Group 7: Effect Registry and Reference Effects
  - [ ] 7.1 Implement `createRegistry` and `EffectDefinition` types
    - Create `packages/engine/src/registry.ts` exporting `SegmentOverrides` interface, `ApplyEffectArgs` interface, `EffectDefinition` interface, `EffectRegistry` interface (with `register` and `get` methods), and `createRegistry(): EffectRegistry` (backed by a `Map<string, EffectDefinition>`; `register` throws `DuplicateEffectError` if id already registered; `get` returns `undefined` for unknown ids).
    - Re-export `createRegistry`, `EffectDefinition`, `EffectRegistry`, `SegmentOverrides`, `ApplyEffectArgs` from `src/index.ts`.
    - **Covers:** Requirement 7.1, Requirement 7.2, Requirement 7.3, Requirement 7.4
    - **Completion:** Unit test in `registry.test.ts` asserts: registering same id twice throws `DuplicateEffectError`; `get` on unknown id returns `undefined`; a registered effect is retrieved by id.

  - [ ] 7.2 Write unit tests for `createRegistry`
    - Create `packages/engine/src/registry.test.ts` with: test to register an effect, retrieve it with `get`, assert deep equality; test to register same id twice and assert `DuplicateEffectError` is thrown; test that `get("unknown-id")` returns `undefined`; test that two separate registries are independent.
    - **Covers:** Requirement 7.1, Requirement 7.2, Requirement 7.3
    - **Completion:** `pnpm vitest run src/registry.test.ts` passes with zero failures.

  - [ ] 7.3 Implement `typewriter` effect
    - Create `packages/engine/src/effects/typewriter/schema.ts` exporting `TypewriterParamsSchema` (Zod object: `startDelay` non-negative default `0`, `delayPerCharacter` non-negative, `direction` `"forward" | "backward"`).
    - Create `packages/engine/src/effects/typewriter/index.ts` exporting `register(registry: EffectRegistry): void`. The `applyEffect` function: for `"forward"` returns `{ opacity: tLocal >= params.startDelay + groupIndex * params.delayPerCharacter ? 1 : 0 }`; for `"backward"` returns `{ opacity: tLocal >= params.startDelay + (groupCount - 1 - groupIndex) * params.delayPerCharacter ? 1 : 0 }`. If params fail `TypewriterParamsSchema.safeParse`, throw `InvalidEffectParamsError`. The module MUST NOT call `register` at load time.
    - **Covers:** Requirement 8.1, Requirement 8.2, Requirement 9.1, Requirement 9.2, Requirement 9.3, Requirement 9.4, Requirement 9.5
    - **Completion:** Unit tests in `typewriter.test.ts` assert: forward opacity below and above threshold; backward opacity; `InvalidEffectParamsError` thrown for bad params.

  - [ ] 7.4 Write unit and property-based tests for `typewriter` effect
    - Add `arbTypewriterParams` and `arbTypewriterBackwardParams` generators to `testing/arbitraries.ts` as part of this task.
    - Create `packages/engine/src/effects/typewriter/typewriter.test.ts` with unit tests (forward/backward opacity at specific `tLocal` values; `InvalidEffectParamsError` for invalid params) and two property-based tests:
    - Property-based test tagged `// Feature: engine-core, Property 14: Typewriter opacity correctness (forward direction)`: using `arbTypewriterParams` (direction: `"forward"`) × `fc.nat()` × `fc.float({ min: 0, noNaN: true })`, assert the opacity rule `tLocal >= params.startDelay + groupIndex * params.delayPerCharacter` returns `1`, otherwise `0`.
    - Property-based test tagged `// Feature: engine-core, Property 16: Typewriter opacity correctness (backward direction)`: using `arbTypewriterBackwardParams` × `fc.nat()` × `fc.nat()` × `fc.float({ min: 0, noNaN: true })`, assert the backward opacity rule.
    - **Covers:** Requirement 9.3, Requirement 9.4, Requirement 9.5, Requirement 11.15 — Property 14, Requirement 11 — Property 16
    - **Completion:** `pnpm vitest run src/effects/typewriter/typewriter.test.ts` passes with zero failures.

  - [ ] 7.5 Implement `fade-slide` effect
    - Create `packages/engine/src/effects/fade-slide/schema.ts` exporting `FadeSlideParamsSchema` (Zod object: `durationSeconds` positive number, `slideDistance` number in px, `slideAxis` `"x" | "y"`, `delayPerSegment` non-negative number, `easing: EasingSchema`).
    - Create `packages/engine/src/effects/fade-slide/index.ts` exporting `register(registry: EffectRegistry): void`. The `applyEffect` function: computes `p = clamp((tLocal - groupIndex * params.delayPerSegment) / params.durationSeconds, 0, 1)`, then `eased = evaluate(params.easing, 0, 1, p)`, returns `{ opacity: eased, positionOffset: slideAxis === "x" ? [params.slideDistance * (1 - eased), 0] : [0, params.slideDistance * (1 - eased)] }`. When `eased === 1`, opacity is exactly `1` and offset is exactly `[0, 0]`. If params fail `FadeSlideParamsSchema.safeParse`, throw `InvalidEffectParamsError`. The module MUST NOT call `register` at load time.
    - **Covers:** Requirement 8.1, Requirement 8.2, Requirement 10.1, Requirement 10.2, Requirement 10.3, Requirement 10.4, Requirement 10.5
    - **Completion:** Unit tests assert: `p=0` → full offset and opacity 0; `p=1` → zero offset and opacity 1; `InvalidEffectParamsError` for bad params.

  - [ ] 7.6 Write unit and property-based tests for `fade-slide` effect
    - Add the `arbFadeSlideParams` generator to `testing/arbitraries.ts` as part of this task.
    - Create `packages/engine/src/effects/fade-slide/fade-slide.test.ts` with unit tests (`p=0` full offset, `p=1` zero offset; `InvalidEffectParamsError`; both `slideAxis` variants produce correct offset direction) and a property-based test tagged `// Feature: engine-core, Property 15: Fade-slide boundary condition`: using `arbFadeSlideParams`, for any params, assert `applyEffect` called at the completion point (`tLocal = groupIndex * delayPerSegment + durationSeconds`) returns opacity exactly `1` and position offset exactly `[0, 0]`.
    - **Covers:** Requirement 10.3, Requirement 10.4, Requirement 10.5, Requirement 11 — Property 15
    - **Completion:** `pnpm vitest run src/effects/fade-slide/fade-slide.test.ts` passes with zero failures.

  - [ ] 7.7 Implement `registerBuiltinEffects` and default registry
    - Create `packages/engine/src/effects/index.ts` exporting `registerBuiltinEffects(registry: EffectRegistry): void` (imports and calls `register` from `typewriter/index.ts` and `fade-slide/index.ts`) and `builtinRegistry: EffectRegistry` (module-level constant: `createRegistry()` with `registerBuiltinEffects` called on it). The registry is not injected by module-load side effects on the registry module itself.
    - Re-export `registerBuiltinEffects` and `builtinRegistry` from `src/index.ts`.
    - **Covers:** Requirement 7.6, Requirement 7.7, Requirement 8.3
    - **Completion:** Unit test asserts `builtinRegistry.get("typewriter")` and `builtinRegistry.get("fade-slide")` both return defined `EffectDefinition` objects.

  - [ ] 7.8 Extend `arbValidProject` with effect instances and `arbGraphemeText`
    - Extend `arbValidProject` (and `arbTextLayer`) in `testing/arbitraries.ts` so generated layers include `effectInstances` referencing the built-in effects (`typewriter`, `fade-slide`) with valid params drawn from the effect-param arbitraries, covering all three granularities (`character`, `word`, `line`).
    - Add `arbGraphemeText` generator mixing ASCII, ZWJ emoji sequences, and Tamil characters.
    - Update `arbitraries.test.ts` smoke test to assert extended `arbValidProject` values still pass `ProjectSchema.safeParse`.
    - **Covers:** Requirement 11.7
    - **Completion:** `pnpm vitest run src/testing/arbitraries.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement effect registry, reference effects, and full arbitraries`

  - [ ] 7.9 Checkpoint — Group 7
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 8. Group 8: computeFrameState
  - [ ] 8.1 Implement `computeFrameState`
    - Create `packages/engine/src/compute.ts` exporting `computeFrameState(project: Project, t: number, opts: ComputeOpts): FrameState`:
    - Step 1: clamp `t` — NaN or non-finite → `0`; `< 0` → `0`; `> durationSeconds` → `durationSeconds`.
    - Step 2: filter active layers using the half-open interval rule (`t >= startSeconds && (t < endSeconds || (t === endSeconds && endSeconds === durationSeconds))`).
    - Step 3: for each active layer — compute `tLocal = t - layer.startSeconds`; interpolate all `KeyframeTrack` values via `interpolateTrack` to build `LayerState.transform`; call `segmentText(layer.text)` to get `SegmentToken[]`; call `layoutSegments(tokens, layer, opts.metricsProvider, cache)` using `opts.layoutCache` (auto-create a fresh `Map` if omitted); for each segment derive PRNG via `derivePRNG`; for each active `EffectInstance` call `applyEffect` in try/catch (on `InvalidEffectParamsError` push `InvalidEffectParamsWarning`; on non-finite override value push warning and discard that property); compose `SegmentOverrides` (opacity multiply+clamp to `[0,1]`, positionOffset add, others last-writer-wins); build `BaseSegment` objects.
    - Step 4: push `UnknownEffectWarning` when `registry.get(effectId)` is `undefined`.
    - Step 5: traverse assembled `FrameState` and replace all `Object.is(v, -0)` values with `+0`.
    - `ComputeOpts` defaults: `registry` defaults to `builtinRegistry`; `layoutCache` auto-created as fresh `Map` if not provided.
    - **Covers:** Requirement 5.1, Requirement 5.4, Requirement 5.5, Requirement 5.6, Requirement 5.7, Requirement 5.8, Requirement 5.9, Requirement 5.10, Requirement 5.11, Requirement 5.13, Requirement 5.14, Requirement 7.5, Requirement 15.1, Requirement 15.2
    - **Completion:** Unit tests in `compute.test.ts` assert: inactive layers are excluded; `tLocal` is correct; unknown effect id produces `UnknownEffectWarning`; `applyEffect` exception produces `InvalidEffectParamsWarning`; `-0` is normalised to `0`.

  - [ ] 8.2 Write unit tests for `computeFrameState`
    - Create `packages/engine/src/compute.test.ts` with unit tests covering: layer visibility at exact `startSeconds` (active), just before (inactive), at exact `endSeconds` (inactive unless `endSeconds === durationSeconds`); `t < 0` clamps to `0`; `t > durationSeconds` clamps to `durationSeconds`; `t = NaN`, `Infinity`, `-Infinity` each return valid `FrameState` without throwing; unknown effect id → `UnknownEffectWarning`; `applyEffect` throwing → `InvalidEffectParamsWarning` and segment rendered with no effect; non-finite value in `SegmentOverrides` → warning, property discarded; a `FrameState` with any `-0` field returns `+0`.
    - **Covers:** Requirement 5.5, Requirement 5.6, Requirement 5.7, Requirement 5.8, Requirement 5.9, Requirement 5.10, Requirement 5.13, Requirement 5.14
    - **Completion:** `pnpm vitest run src/compute.test.ts` passes with zero failures.

  - [ ] 8.3 Write property-based tests for `computeFrameState` (Properties 3, 4, 5, 6, 9, 10, 11)
    - In `packages/engine/src/compute.test.ts`, add the following fast-check property-based tests:
    - Property 3 tagged `// Feature: engine-core, Property 3: computeFrameState total function` — for any `arbValidProject` and `arbT(project)`, assert `computeFrameState` does not throw and returns a `FrameState`.
    - Property 4 tagged `// Feature: engine-core, Property 4: computeFrameState determinism` — for any `arbValidProject` and `arbT`, assert two sequential calls return deeply equal results.
    - Property 5 tagged `// Feature: engine-core, Property 5: computeFrameState random-access determinism` — for any `arbValidProject` and two `arbT` values `t1`, `t2`, assert `computeFrameState(p, t2)` alone equals `computeFrameState(p, t1)` followed by `computeFrameState(p, t2)`.
    - Property 6 tagged `// Feature: engine-core, Property 6: Non-finite t handled safely` — for any `arbValidProject`, assert `computeFrameState(p, NaN)`, `computeFrameState(p, Infinity)`, and `computeFrameState(p, -Infinity)` each return a valid `FrameState` without throwing.
    - Property 9 tagged `// Feature: engine-core, Property 9: FrameState JSON round-trip` — for any `arbValidProject` and `arbT`, assert `JSON.parse(JSON.stringify(state))` is deeply equal to `state`. Companion unit test asserts a `FrameState` containing `-0` has it normalised to `0`.
    - Property 10 tagged `// Feature: engine-core, Property 10: Opacity bounds invariant` — for any `arbValidProject` and `arbT`, assert that every active layer's `transform.opacity` is in `[0, 1]` AND every segment's `effectOverrides.opacity` (when present) is in `[0, 1]`.
    - Property 11 tagged `// Feature: engine-core, Property 11: Grapheme cluster completeness invariant` — for any `arbValidProject` and `arbT`, assert `segment.text` values in active layer states match exactly the grapheme clusters from `Intl.Segmenter` over `layer.text`, in order.
    - **Covers:** Requirement 5.4, Requirement 5.5, Requirement 5.8, Requirement 5.10, Requirement 11.1, Requirement 11.2, Requirement 11.9, Requirement 11.10, Requirement 11.12, Requirement 11.13, Requirement 11.14 — Properties 3, 4, 5, 6, 9, 10, 11
    - **Completion:** `pnpm vitest run src/compute.test.ts` passes with zero failures.
    - Commit: `feat(engine-core): implement computeFrameState with full PBT suite (Properties 3–6, 9–11)`

  - [ ] 8.4 Checkpoint — Group 8
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 9. Group 9: drawFrame and renderFrame
  - [ ] 9.1 Implement `drawFrame`
    - Create `packages/engine/src/draw.ts` exporting `drawFrame(ctx: CanvasRenderingContext2D, state: FrameState): void`:
    - Clear background: if `"transparent"` call `ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight)`; otherwise set `ctx.fillStyle` and call `ctx.fillRect`.
    - Per layer in order: (a) `ctx.save()`; (b) translate to anchor + positionOffset; (c) rotate about layer center; (d) scale about layer center; (e) `ctx.globalAlpha = transform.opacity`; (f) per segment: `ctx.save()`, translate to layoutX/layoutY + effectOverrides positionOffset, apply segment rotation/scale about segment center, set `ctx.globalAlpha = clamp(layerOpacity * (effectOverrides.opacity ?? 1), 0, 1)`, set `ctx.filter = blur > 0 ? \`blur(${blur}px)\` : 'none'` (only when needed), set fill color (effectOverrides.color → colorOverride → layer.fill), call `ctx.fillText(segment.text, 0, 0)`, `ctx.restore()`; (g) `ctx.restore()`.
    - `drawFrame` MUST NOT contain interpolation, easing computation, or business logic.
    - **Covers:** Requirement 5.2, Requirement 5.9, Requirement 5.12
    - **Completion:** Unit test in `draw.test.ts` using a spy `CanvasRenderingContext2D` mock asserts: `clearRect` called for transparent background; `fillRect` called for hex background; `ctx.filter` set when blur > 0 and reset to `'none'` otherwise; `fillText` called once per segment.

  - [ ] 9.2 Write unit tests for `drawFrame`
    - Create `packages/engine/src/draw.test.ts` with a spy `CanvasRenderingContext2D` (all required methods as `vi.fn()`): test transparent background → `ctx.clearRect` called, `ctx.fillRect` not called; test hex background → `ctx.fillStyle` set and `ctx.fillRect` called; test blur > 0 → `ctx.filter` set to `'blur(Npx)'`; test blur = 0 → `ctx.filter` set to `'none'`; test `fillText` called once per segment; test `ctx.save` and `ctx.restore` called in balanced pairs.
    - **Covers:** Requirement 5.2, Requirement 5.12
    - **Completion:** `pnpm vitest run src/draw.test.ts` passes with zero failures.

  - [ ] 9.3 Implement `renderFrame`
    - Create `packages/engine/src/render.ts` exporting `renderFrame(project: Project, t: number, opts?: RenderOpts): void`: extract `ctx` from `opts`; if `opts.metricsProvider` not provided construct `new CanvasMetricsProvider(ctx)`; call `computeFrameState(project, t, { metricsProvider, registry: opts?.registry, layoutCache: opts?.layoutCache })`; call `drawFrame(ctx, state)`. `RenderOpts` interface: `{ ctx: CanvasRenderingContext2D; metricsProvider?: TextMetricsProvider; registry?: EffectRegistry; layoutCache?: Map<string, LayoutGeometry[]> }`.
    - Re-export `renderFrame` and `RenderOpts` from `src/index.ts`.
    - **Covers:** Requirement 5.3
    - **Completion:** TypeScript compiles `render.ts` without errors. A unit test stubs `computeFrameState` and `drawFrame` and asserts both are called with the correct arguments.
    - Commit: `feat(engine-core): implement drawFrame and renderFrame`

  - [ ] 9.4 Checkpoint — Group 9
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 10. Group 10: Arbitraries and Full Property-Based Test Suite
  - [ ] 10.1 Validate and consolidate arbitraries
    - Consolidate and validate the generators already created across Groups 3 and 7 in `packages/engine/src/testing/arbitraries.ts`; do NOT create any generators from scratch. Re-run the arbitraries smoke test, confirm all generators satisfy their corresponding Zod schemas, and fix any constraint drift (keyframe `t` range, `endSeconds > startSeconds`, etc.). Run `fc.check(fc.property(arbValidProject, p => ProjectSchema.safeParse(p).success))` and the same for `arbValidEffectPack`, asserting both pass.
    - **Covers:** Requirement 11.7
    - **Completion:** `pnpm vitest run src/testing/arbitraries.test.ts` passes with zero failures.

  - [ ] 10.2 Integrate and consolidate all 17 property-based tests
    - Re-run all existing property-based test files (`compute.test.ts`, `serialize.test.ts`, `schemas/project.test.ts`, `prng.test.ts`, `easing.test.ts`, `effects/typewriter/typewriter.test.ts`, `effects/fade-slide/fade-slide.test.ts`) using the now-complete `arbValidProject` and `arbValidEffectPack` generators, replacing any temporary inline stubs. Confirm all 17 properties listed in the design are present and tagged with their property numbers: Properties 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, and 17.
    - **Covers:** Requirement 11.1, Requirement 11.2, Requirement 11.4, Requirement 11.6, Requirement 11.9, Requirement 11.10, Requirement 11.11, Requirement 11.12, Requirement 11.13, Requirement 11.14
    - **Completion:** `pnpm vitest run` passes with all 17 property tests present and tagged. Zero failures.
    - Commit: `feat(engine-core): complete arbitraries and validate all 17 PBT properties`

  - [ ] 10.3 Checkpoint — Group 10
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 11. Group 11: JSON Schema Generation Script and Staleness Test
  - [ ] 11.1 Implement `generate-schemas.ts` build script
    - Create `packages/engine/scripts/generate-schemas.ts`: import `ProjectSchema`, `EffectPackSchema`, and each built-in effect's `paramSchema` from the engine package; call `z.toJSONSchema(schema)` (Zod v4 native — `zod-to-json-schema` MUST NOT be used) for each schema; write resulting JSON to `packages/engine/schema/project.json`, `packages/engine/schema/effect-pack.json`, and `packages/engine/schema/<effectId>-params.json` for each built-in effect. Add a `"generate-schemas"` script entry to `packages/engine/package.json`. Run the script once to produce and commit the initial `schema/*.json` files.
    - **Covers:** Requirement 3.3, Requirement 3.4, Requirement 3.5, Requirement 14.1
    - **Completion:** `pnpm --filter @studio/engine generate-schemas` exits with code 0 and writes `schema/project.json` and `schema/effect-pack.json`.

  - [ ] 11.2 Write JSON Schema staleness test and AJV validation test
    - In `packages/engine/src/schemas/schema-staleness.test.ts`: add a staleness test that imports the generation logic as a module function, runs it in memory, and deep-compares output against committed files in `packages/engine/schema/` — fails with a clear message if they differ; add an AJV validation test that compiles each generated JSON Schema file and validates a corpus of at least five valid documents from the arbitraries — asserts all validate successfully.
    - **Covers:** Requirement 3.5, Requirement 3.7
    - **Completion:** `pnpm vitest run src/schemas/schema-staleness.test.ts` passes with zero failures. Manually mutating `schema/project.json` causes the staleness test to fail.
    - Commit: `feat(engine-core): add JSON Schema generation script and staleness test`

  - [ ] 11.3 Checkpoint — Group 11
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 12. Group 12: Playwright Visual Test Setup
  - [ ] 12.1 Create Vite visual test app
    - Create `packages/engine/tests/visual/app/index.html` with a single `<canvas id="canvas" width="800" height="450">` and a module script tag.
    - Create `packages/engine/tests/visual/app/main.ts` importing `drawFrame` from `@studio/engine`, self-hosting OFL fonts (Noto Sans, Noto Sans Tamil) via CSS `@font-face` declarations pointing to `../fonts/`, awaiting `document.fonts.ready`, and exposing `window.fontsReady = true` and `window.render = (state) => { const ctx = canvas.getContext("2d"); drawFrame(ctx, state); }`.
    - Create `packages/engine/tests/visual/app/vite.config.ts` with `root: "tests/visual/app"` and `server.port: 5173`.
    - Create `packages/engine/tests/visual/fonts/` directory and commit `NotoSans-Regular.ttf` and `NotoSansTamil-Regular.ttf` (both OFL-licensed). Add both font entries to `docs/dependencies.md`.
    - **Covers:** Requirement 12.1, Requirement 12.4, Requirement 12.5
    - **Completion:** TypeScript in `main.ts` compiles without errors. Directory structure matches the design spec.

  - [ ] 12.2 Create `generate-visual-fixtures.ts` and commit fixture JSON
    - Create `packages/engine/scripts/generate-visual-fixtures.ts` constructing at least three representative projects: (1) a project with a single layer using the `typewriter` effect and ASCII text; (2) a project with a single layer using the `fade-slide` effect; (3) a project with a single layer using the `typewriter` effect and Tamil text (`"வணக்கம்"`) with `fontFamily: "Noto Sans Tamil"`. For each, call `computeFrameState(project, t, { metricsProvider: FakeMetricsProvider })` and write each `FrameState` to `tests/visual/fixtures/<name>.json`.
    - Run the script once and commit the resulting fixture JSON files.
    - **Covers:** Requirement 12.4, Requirement 12.5
    - **Completion:** `pnpm --filter @studio/engine generate-visual-fixtures` exits with code 0 and writes at least three JSON files to `tests/visual/fixtures/`.

  - [ ] 12.3 Configure Playwright and write golden-image tests
    - Run `pnpm exec playwright install chromium` to install the Chromium browser binary before the first Playwright run.
    - Create `packages/engine/playwright.config.ts` with `projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]` (Chromium only — no Firefox or WebKit), `webServer: { command: "vite tests/visual/app --port 5173", port: 5173, reuseExistingServer: !process.env.CI }`, `testDir: "tests/visual"`, and `snapshotDir: "tests/visual/__snapshots__"`.
    - Create `packages/engine/tests/visual/draw-frame.spec.ts`: for each committed fixture in `tests/visual/fixtures/`, navigate to `http://localhost:5173`, wait for `window.fontsReady`, call `page.evaluate(fixture => window.render(fixture), fixtureJson)`, capture canvas screenshot, compare to golden PNG with `{ maxDiffPixelRatio: 0.001 }`. On mismatch, include the diff path in the failure output. The test MUST NOT call `computeFrameState` or `renderFrame`.
    - **Covers:** Requirement 12.1, Requirement 12.2, Requirement 12.3, Requirement 12.5, Requirement 12.6
    - **Completion:** `pnpm --filter @studio/engine exec playwright test --project=chromium` writes golden PNGs on first run and passes on subsequent runs with zero pixel-diff failures.
    - Commit: `feat(engine-core): Playwright golden-image tests for drawFrame (typewriter, fade-slide, Tamil)`

  - [ ] 12.4 Checkpoint — Group 12
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 13. Group 13: ESLint Enforcement, Kiro Hook, and CONTRIBUTING.md
  - [ ] 13.1 Verify ESLint `no-restricted-properties` rule covers all banned calls
    - Add `packages/engine/src/__tests__/eslint-purity.test.ts`: write a temporary TypeScript snippet calling `Math.random()`, `Date.now()`, and `performance.now()`; programmatically invoke the ESLint `Linter` on the snippet with `eslint.config.js` rules loaded; assert exactly three ESLint errors are produced, each identifying the correct property name.
    - **Covers:** Requirement 13.1, Requirement 13.3
    - **Completion:** `pnpm vitest run src/__tests__/eslint-purity.test.ts` passes with zero failures.

  - [ ] 13.2 Create Kiro `PostFileSave` hook for ESLint
    - Do NOT hand-author a hook JSON file with an invented schema. Instead, create the hook through Kiro's Hooks UI: trigger on file save matching `packages/engine/src/**`, with an action that runs the lint script (`pnpm --filter @studio/engine lint`), reporting only (does not block saves). Keep whatever file Kiro generates under `.kiro/hooks/`.
    - **Covers:** Requirement 13.2
    - **Completion:** The hook appears in the Kiro Hooks panel and fires when a file under `packages/engine/src/` is saved (verified with a test save).

  - [ ] 13.3 Write `packages/engine/CONTRIBUTING.md`
    - Create `packages/engine/CONTRIBUTING.md` documenting: (1) directory structure — `src/effects/<kebab-id>/` with `index.ts`, `schema.ts`, and `*.test.ts`; (2) registration pattern — `index.ts` exports `register(registry: EffectRegistry): void`, MUST NOT call `register` at module load time; (3) test requirements — at least one unit test and one property-based test using `computeFrameState` with a fresh `createRegistry()`, `FakeMetricsProvider`, and `fc.assert`; (4) ESLint purity rules — `Math.random`, `Date.now`, `performance.now` are banned in `src/**`; use `createPRNG` for randomness; (5) commit conventions — Conventional Commits format; reference spec task id in commit message.
    - **Covers:** Requirement 8.4
    - **Completion:** `CONTRIBUTING.md` exists and contains all five sections listed above.
    - Commit: `feat(engine-core): ESLint purity test, Kiro hook, and CONTRIBUTING.md`

  - [ ] 13.4 Checkpoint — Group 13
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0 and zero failures.

- [ ] 14. Group 14: Benchmark
  - [ ] 14.1 Wire root `pnpm test` workspace-check script
    - Add a `"test"` script to the ROOT `package.json` that runs, in sequence, the full workspace checks: typecheck (`tsc --noEmit` across the workspace or `pnpm -r exec tsc --noEmit`), lint (`pnpm -r lint`), and `pnpm -r vitest run`.
    - Ensure `packages/engine/package.json` has a `"lint"` script and a test script so the recursive commands pick it up.
    - **Covers:** Requirement 11.8
    - **Completion:** Running `pnpm test` from the repo root runs typecheck, lint, and the full Vitest suite; all pass with zero errors.

  - [ ] 14.2 Implement `compute.bench.ts` performance benchmark
    - Create `packages/engine/src/compute.bench.ts` using Vitest's `bench` API.
    - Define a `project200` fixture at file top: a project with one text layer containing exactly 200 characters and two character-granularity effects (`typewriter` and `fade-slide`).
    - Write a benchmark: `bench("computeFrameState — 200 chars, 2 effects, cold cache", () => { computeFrameState(project200, 0.5, { metricsProvider: FakeMetricsProvider, layoutCache: new Map() }); }, { time: 500 })`. A fresh `Map` for `layoutCache` MUST be created inside each iteration to ensure a cold cache. Include a comment `// Target: < 4 ms mean`.
    - **Covers:** Requirement 15.3, Requirement 15.4
    - **Completion:** `pnpm vitest bench src/compute.bench.ts` runs without error and reports a mean time.

  - [ ] 14.3 Checkpoint — Group 14 (Final)
    - Run `pnpm vitest run` from `packages/engine` and `pnpm eslint packages/engine/src` — all pass with zero errors.
    - **Completion:** Both commands exit with code 0, zero test failures, and zero lint errors. The full `packages/engine` implementation is complete.
    - Commit: `feat(engine-core): add computeFrameState benchmark (compute.bench.ts)`

---

## Notes

- Every property-based test is required and tagged with its property number and the corresponding requirement clause.
- The `zod-to-json-schema` package MUST NOT appear anywhere in this implementation; use `z.toJSONSchema()` from Zod v4 native API.
- `Math.random`, `Date.now`, and `performance.now` are banned in all `packages/engine/src/**` files; violations are caught by ESLint.
- All Playwright tests run Chromium only; Firefox and WebKit are excluded.
- Golden PNG files in `tests/visual/__snapshots__/` are committed to the repository.
- Layout cache (`layoutCache`) in `ComputeOpts` is scoped to the caller's opts instance — there is no global shared cache.
- No tasks in this plan are optional. Every task, including all property-based tests, is required per the spec.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["2.1"] },
    { "id": 6, "tasks": ["2.2", "2.6"] },
    { "id": 7, "tasks": ["2.3", "2.7"] },
    { "id": 8, "tasks": ["2.4", "2.5", "2.8"] },
    { "id": 9, "tasks": ["2.9"] },
    { "id": 10, "tasks": ["3.1", "3.2"] },
    { "id": 11, "tasks": ["3.3", "3.4"] },
    { "id": 12, "tasks": ["3.5"] },
    { "id": 13, "tasks": ["3.6"] },
    { "id": 14, "tasks": ["3.7"] },
    { "id": 15, "tasks": ["3.8", "3.9", "3.10", "3.11"] },
    { "id": 16, "tasks": ["3.12"] },
    { "id": 17, "tasks": ["4.1"] },
    { "id": 18, "tasks": ["4.2"] },
    { "id": 19, "tasks": ["4.3"] },
    { "id": 20, "tasks": ["5.1", "5.2"] },
    { "id": 21, "tasks": ["5.3"] },
    { "id": 22, "tasks": ["5.4"] },
    { "id": 23, "tasks": ["6.1"] },
    { "id": 24, "tasks": ["6.2"] },
    { "id": 25, "tasks": ["6.3"] },
    { "id": 26, "tasks": ["7.1"] },
    { "id": 27, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 28, "tasks": ["7.4", "7.6"] },
    { "id": 29, "tasks": ["7.7"] },
    { "id": 30, "tasks": ["7.8"] },
    { "id": 31, "tasks": ["7.9"] },
    { "id": 32, "tasks": ["8.1"] },
    { "id": 33, "tasks": ["8.2"] },
    { "id": 34, "tasks": ["8.3"] },
    { "id": 35, "tasks": ["8.4"] },
    { "id": 36, "tasks": ["9.1"] },
    { "id": 37, "tasks": ["9.2", "9.3"] },
    { "id": 38, "tasks": ["9.4"] },
    { "id": 39, "tasks": ["10.1"] },
    { "id": 40, "tasks": ["10.2"] },
    { "id": 41, "tasks": ["10.3"] },
    { "id": 42, "tasks": ["11.1"] },
    { "id": 43, "tasks": ["11.2"] },
    { "id": 44, "tasks": ["11.3"] },
    { "id": 45, "tasks": ["12.1"] },
    { "id": 46, "tasks": ["12.2"] },
    { "id": 47, "tasks": ["12.3"] },
    { "id": 48, "tasks": ["12.4"] },
    { "id": 49, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 50, "tasks": ["13.4"] },
    { "id": 51, "tasks": ["14.1"] },
    { "id": 52, "tasks": ["14.2"] },
    { "id": 53, "tasks": ["14.3"] }
  ]
}
```
