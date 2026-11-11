# Requirements Document

## Introduction

The engine-core feature defines the foundational rendering engine for the studio — a browser-based motion-text application. It covers the versioned Zod schemas for projects and effect packs, the pure deterministic `renderFrame` pipeline split into `computeFrameState` and `drawFrame`, the effect registry and contribution procedure, two reference effects (typewriter and fade-slide), a property-based test suite running in Node against `computeFrameState`, and a Playwright golden-image test setup for `drawFrame` in Chromium. All logic lives exclusively in `packages/engine`; no UI, exporters, or embed concerns are in scope.

## Glossary

- **Engine**: The `packages/engine` package — the sole home of Zod schemas, the effect registry, and `renderFrame`. Has zero runtime dependencies on `exporters`, `embed`, or `studio`.
- **Project**: A versioned JSON document describing canvas settings, text layers, and keyframe tracks. Validated by the `ProjectSchema` Zod definition.
- **TextLayer**: A single animated text element inside a Project, containing its content, style, timing bounds (`startSeconds`, `endSeconds`), and one or more KeyframeTracks.
- **KeyframeTrack**: An ordered sequence of Keyframes for a single animatable property (position, scale, rotation, opacity, blur, or color) with per-keyframe easing. Keyframe `t` values are in seconds (layer-local). Position values are in px. Rotation is in degrees. Blur is in px. Opacity is unitless in [0, 1].
- **Keyframe**: A (time, value, easing) tuple marking a specific property value at a specific time in seconds. The `easing` field defines the curve for the interval leaving this keyframe; the last keyframe's `easing` is ignored.
- **Easing**: A named or parameterised curve function that interpolates between two keyframe values. Supported set: `linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier(x1,y1,x2,y2)`, `step`.
- **EffectInstance**: A reference from a TextLayer to an effect by its kebab-case id, plus a granularity setting (`character` | `word` | `line`) and effect-specific parameter values.
- **EffectPack**: A versioned, self-contained JSON preset file declaring one or more effect instances with their param descriptors. Validated by `EffectPackSchema`. Contains no executable code.
- **EffectDefinition**: The runtime record registered in the EffectRegistry — id, display name, parameter Zod schema, and `applyEffect` function.
- **EffectRegistry**: An in-memory registry created by `createRegistry()` that maps effect ids to `EffectDefinition` objects. A default built-in registry instance is provided; it is not a hidden global in `computeFrameState`.
- **FrameState**: The pure data output of `computeFrameState` — a snapshot of every active layer's resolved property values and grapheme cluster segments at time `t`, ready to be painted without further computation. JSON-serialisable: contains no `undefined`, `NaN`, `Infinity`, `-0`, or function values.
- **LayerLocalTime**: The time `tLocal = t - layer.startSeconds` (in seconds), passed as the `t` field of the `applyEffect` argument. Keyframe interpolation within a layer also uses `tLocal`. A layer is only evaluated when it is active (see `TextLayer` visibility rule); `tLocal` is therefore always >= 0.
- **computeFrameState**: A pure function `(project: Project, t: number, opts: ComputeOpts) → FrameState`. No canvas, DOM, `Date.now`, `Math.random`, or network access permitted. The `t` value passed to `applyEffect` is layer-local time (`tLocal = t - layer.startSeconds`), not the global project time.
- **drawFrame**: A thin painter function `(ctx: CanvasRenderingContext2D, state: FrameState) → void`. Reads FrameState and issues canvas draw calls only; contains no interpolation or business logic.
- **renderFrame**: The public composition `renderFrame(project, t, opts) → void` that calls `computeFrameState` then `drawFrame`. Must be pure and deterministic.
- **SeededPRNG**: A deterministic pseudo-random number generator implemented as mulberry32 using `Math.imul` for cross-platform portability. A fresh PRNG is derived per `(project.seed, layerId, effectInstanceIndex, granularity, segmentIndex)` by hashing `JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex])` with 32-bit FNV-1a to produce the mulberry32 seed; there is no shared mutable PRNG state across segments or layers.
- **Migration**: A pure function that upgrades a Project or EffectPack from schema version N to N+1.
- **JSON Schema**: A `.json` file generated from a Zod definition via Zod v4's native `z.toJSONSchema()`. Never hand-written.
- **Typewriter**: A reference effect (`typewriter`) that reveals characters sequentially over time.
- **FadeSlide**: A reference effect (`fade-slide`) that fades and slides text elements into position.
- **PBT**: Property-based test — a Vitest + fast-check test that exercises a function over a large space of generated inputs.
- **Golden Image**: A reference PNG captured in Chromium by Playwright; subsequent runs diff against it to catch visual regressions.
- **TextMetricsProvider**: An interface `{ measure(text: string, fontSpec: FontSpec): { width: number, ascent: number, descent: number } }` injected via `ComputeOpts`. Makes `computeFrameState` pure given the provider.
- **FontSpec**: The font descriptor used by `TextMetricsProvider`: `{ fontFamily: string, fontSize: number, fontWeight: string, letterSpacing: number }`.
- **FakeMetricsProvider**: A deterministic test double implementing `TextMetricsProvider` using a fixed character advance (e.g. `fontSize * 0.6` per character). Used in all Node and PBT tests.
- **CanvasMetricsProvider**: A canvas-backed implementation of `TextMetricsProvider` using `CanvasRenderingContext2D.measureText`. Used in Chromium golden tests.
- **GraphemeCluster**: A single user-perceived character as produced by `Intl.Segmenter` with `granularity: "grapheme"`. May span multiple Unicode codepoints (e.g. Tamil akshara, emoji with ZWJ). The base render unit in the engine.
- **BaseSegment**: A single grapheme cluster with its resolved layout position (`layoutX`, `layoutY`, `width`, `height` relative to the layer anchor; `layoutX` includes the per-line alignment offset), its `charIndex`, `wordIndex`, `lineIndex`, and composed `effectOverrides`.
- **SegmentOverrides**: A partial record of property overrides returned by `applyEffect`. Composition rules: `opacity` overrides multiply together and clamp to `[0, 1]`; `positionOffset` overrides add together; all other properties (`scale`, `rotation`, `blur`, `color`) replace (last-writer-wins). Keyframe-interpolated values are the baseline; effect overrides layer on top. Units: `positionOffset` in px, `rotation` in degrees, `blur` in px, `opacity` unitless [0, 1], `scale` unitless multiplier.

## Requirements

### Requirement 1: Project Document Schema

**User Story:** As an engine consumer, I want a versioned, Zod-validated Project schema, so that I can create, save, load, and migrate project documents with confidence that every field is correctly typed and constrained.

#### Acceptance Criteria

1. THE Engine SHALL export a `ProjectSchema` Zod object that validates a Project document containing: `schemaVersion` (positive integer), `canvas` (width 1–7680 px, height 1–4320 px, fps 1–120, durationSeconds 0.1–600), `background` (hex color string or the literal `"transparent"`), `seed` (integer used to initialise the SeededPRNG), and `layers` (array of TextLayer, max 64).
2. THE Engine SHALL export a `TextLayerSchema` Zod object that validates: `id` (non-empty string), `text` (non-empty string, max 2000 characters), `tracks` (array of KeyframeTrack), `effectInstances` (array of EffectInstance, max 16 per layer), `fontFamily` (non-empty string), `fontSize` (positive number in px, max 1000 px), `fontWeight` (string, e.g. `"400"`, `"bold"`), `fill` (hex color string), `align` (`left` | `center` | `right`; resolved per line in layout geometry as specified in Requirement 5, criterion 15), `letterSpacing` (number in px, range −500 to 500 px, default `0`), `lineHeight` (positive number multiplier, range 0.1 to 10, default `1.2`), `maxWidth` (positive number in px, or `null` for no wrapping), `startSeconds` (non-negative number, >= 0), `endSeconds` (number, must be > startSeconds and <= canvas.durationSeconds), and `anchor` (`{ x: number, y: number }` in canvas coordinates in px, each in range −32000 to 32000 px; default is canvas center, i.e. `{ x: canvas.width / 2, y: canvas.height / 2 }`). All layer-level transforms (scale, rotation) are applied about the layer's center, not the anchor. The `position` keyframe track represents an OFFSET from the anchor (i.e. final position = anchor + position offset). A layer is active during the half-open interval `[startSeconds, endSeconds)`. Exception: if `layer.endSeconds === canvas.durationSeconds`, the layer is also active at `t = canvas.durationSeconds` (i.e. the final frame). This ensures two adjacent layers where the first ends at time T and the second starts at time T are never both active at T.
3. THE Engine SHALL export a `KeyframeTrackSchema` Zod object that validates: `property` (one of `position` | `scale` | `rotation` | `opacity` | `blur` | `color`), and `keyframes` (array of at least one Keyframe with strictly increasing `t` values where each `t` is strictly greater than the previous keyframe's `t`). Max 500 keyframes per track.
4. THE Engine SHALL export a `KeyframeSchema` Zod object that validates: `t` (non-negative number in seconds), `value` (a typed value matching the track's property — `[x,y]` tuple for position where each value is in range −32000 to 32000 px, positive number for scale (max 100), number in degrees for rotation in range −36000 to 36000 degrees, number 0–1 for opacity, non-negative number for blur in range 0 to 1000 px, hex color string for color), and `easing` (an EasingSchema value defining the interpolation curve for the interval leaving this keyframe; the last keyframe's `easing` is present but ignored during interpolation).
5. THE Engine SHALL export an `EasingSchema` Zod union covering `linear`, `easeIn`, `easeOut`, `easeInOut`, `{ type: "cubicBezier", x1, y1, x2, y2 }` (all control-point values validated to be in [0, 1]; values outside this range are rejected by `EasingSchema.safeParse` with a `ZodError`), and `{ type: "step", steps: positiveInteger }`.
6. THE Engine SHALL export an `EffectInstanceSchema` Zod object that validates: `effectId` (non-empty kebab-case string), `granularity` (`character` | `word` | `line`), and `params` (a record validated against the referenced effect's parameter schema at runtime).
7. WHEN a Project document fails `ProjectSchema.safeParse`, THE Engine SHALL return a `ZodError` describing every violated constraint without throwing.
8. THE Engine SHALL export a `serializeProject` function that converts a validated Project to a JSON string and a `parseProject` function that runs `ProjectSchema.safeParse` on a JSON string and returns either the typed Project or a typed `ParseError`. `parseProject` SHALL reject any input whose UTF-8 byte length exceeds 5 MB (5,242,880 bytes). The UTF-8 byte length is computed as `new TextEncoder().encode(json).byteLength`. `parseProject` SHALL return a typed `ParseError` without throwing when this limit is exceeded.
9. FOR ALL valid Project values `p`, `parseProject(serializeProject(p))` SHALL return a value deeply equal to `p` (round-trip property).
10. THE Engine SHALL export a `CURRENT_PROJECT_VERSION` constant equal to the latest `schemaVersion` integer.
11. THE Engine SHALL interpolate `color` KeyframeTrack values per-channel in sRGB: R, G, and B are each interpolated as a continuous value in [0, 255], rounded to the nearest integer (using standard half-up rounding), then re-encoded as a two-digit hex string.
12. WHEN `startSeconds >= endSeconds` or `endSeconds > canvas.durationSeconds`, `ProjectSchema.safeParse` SHALL reject the document with a `ZodError` (via a Zod `.refine()` or `.superRefine()` cross-field check on the layer).
13. THE `ProjectSchema` SHALL include a cross-field `.superRefine()` check that rejects any Project where a keyframe's `t` exceeds `(layer.endSeconds - layer.startSeconds)` — the layer's duration in layer-local seconds. Keyframe `t` values are layer-local (0 = layer start), so the valid range for a keyframe is `[0, endSeconds - startSeconds]`.

### Requirement 2: Schema Versioning and Migration

**User Story:** As an engine consumer, I want older project files to be automatically migrated to the current schema version, so that saved projects remain openable after schema changes.

#### Acceptance Criteria

1. THE Engine SHALL export a `migrateProject` function that accepts a raw JSON object with any supported `schemaVersion` and returns a fully validated Project at `CURRENT_PROJECT_VERSION`.
2. WHEN `migrateProject` receives a document at version N less than `CURRENT_PROJECT_VERSION`, THE Engine SHALL apply every migration step from N to `CURRENT_PROJECT_VERSION` in order without skipping a step.
3. WHEN `migrateProject` receives a document whose `schemaVersion` exceeds `CURRENT_PROJECT_VERSION`, THE Engine SHALL return a typed `MigrationError` and not throw.
4. WHEN `migrateProject` receives a document whose `schemaVersion` equals `CURRENT_PROJECT_VERSION`, THE Engine SHALL validate and return the document without applying any migration steps.
5. THE Engine SHALL include a synthetic fixture set in `packages/engine/src/testing/fixtures/` containing at least one committed JSON file per supported schema version. The migration PBT in Requirement 11 uses these fixtures rather than generated values.
6. `migrateProject` SHALL accept an optional second parameter `migrations?: MigrationMap` — a map from version number to migration function — so that tests can exercise multi-step migration chains using synthetic schema versions without modifying production migration code.

### Requirement 3: Effect-Pack Schema and JSON Schema Generation

**User Story:** As an effect author, I want a versioned, Zod-validated EffectPack schema and a generated JSON Schema file, so that I can distribute shareable effect presets that can be validated in any JSON-aware tool.

#### Acceptance Criteria

1. THE Engine SHALL export an `EffectPackSchema` Zod object that validates: `schemaVersion` (positive integer), `id` (non-empty kebab-case string), `displayName` (non-empty string), `description` (string), `effectInstances` (array of `{ effectId, granularity, params }` objects, max 16), and `paramDescriptors` (array of descriptor objects where each descriptor has `key` (string), `type` (`number` | `enum` | `color`), a required `binding` field `{ effectInstanceIndex: number, paramKey: string }` where `effectInstanceIndex` is the 0-based index into the pack's `effectInstances` array and `paramKey` is a key that exists in the referenced effect's parameter schema, and type-specific constraints: number → `min`, `max`, `default` (all numbers); enum → `values` (string[]), `default` (string); color → `default` (hex string)).
2. WHEN an EffectPack document fails `EffectPackSchema.safeParse`, THE Engine SHALL return a `ZodError` describing every violated constraint without throwing.
3. THE Engine SHALL provide a build-time script `packages/engine/scripts/generate-schemas.ts` that reads all exported Zod schemas (`ProjectSchema`, `EffectPackSchema`, and any registered effect param schemas) and writes the corresponding JSON Schema files to `packages/engine/schema/`.
4. THE Engine SHALL NOT contain any hand-written JSON Schema files; all `.json` files in `packages/engine/schema/` MUST be outputs of the generation script.
5. WHEN the generation script runs, the generated JSON Schema files SHALL accept every document that the corresponding Zod schema accepts, verified at test time by running `ajv` against a corpus of valid generated documents.
6. FOR ALL valid EffectPack values `ep`, `EffectPackSchema.safeParse(JSON.parse(JSON.stringify(ep)))` SHALL succeed (JSON round-trip property).
7. THE Engine's test suite SHALL include a test that runs the generation script, compares the output to the committed files in `packages/engine/schema/`, and fails if they differ (schema-staleness check).
8. EffectPack MUST NOT contain executable code; `EffectPackSchema.safeParse` on any JSON value SHALL never invoke `eval` or `Function`.
9. EffectPack instances are treated as untrusted input; `params` values MUST be re-validated against the referenced effect's `paramSchema` (from the registry) before being passed to `applyEffect`. THE Engine SHALL check that the max JSON size of an EffectPack is 1 MB before parsing; inputs exceeding this limit SHALL be rejected with a typed error without invoking `safeParse`.
10. WHEN `EffectPackSchema.safeParse` is applied to an EffectPack, THE Engine SHALL validate that every `paramDescriptor.binding.effectInstanceIndex` is within the bounds of the `effectInstances` array. Binding validity against the effect's actual `paramSchema` (i.e. whether `paramKey` exists) is validated at runtime when the pack is applied against a registry, not at parse time.

### Requirement 4: SeededPRNG

**User Story:** As an effect author, I want a deterministic PRNG seeded from the project, so that effects that need randomness produce identical output on every render of the same project.

#### Acceptance Criteria

1. THE Engine SHALL export a `createPRNG` function that accepts an integer seed and returns a `PRNG` object with a `next(): number` method returning values in `[0, 1)`. The algorithm SHALL be mulberry32 implemented using `Math.imul` for cross-platform portability.
2. WHEN `createPRNG(seed)` is called with the same seed, THE Engine SHALL return a PRNG whose sequence of `next()` values is identical across calls, runtimes, and platforms (determinism property).
3. THE Engine SHALL NOT call `Math.random` anywhere in `packages/engine/src/`. All randomness MUST flow through `createPRNG`.
4. THE Engine SHALL NOT call `Date.now`, `performance.now`, or any time API for purposes other than an explicit timing measurement utility that is itself not used inside `computeFrameState` or `drawFrame`.
5. `computeFrameState` SHALL derive a fresh PRNG per `(project.seed, layerId, effectInstanceIndex, granularity, segmentIndex)` using a 32-bit FNV-1a hash over the string `JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex])` as the seed input to `createPRNG`. Using `JSON.stringify` of an array avoids ambiguity when `layerId` contains special characters such as colons. This ensures two different effects on the same segment receive independent random streams. There is no shared mutable PRNG state.

### Requirement 5: renderFrame Pipeline

**User Story:** As a preview renderer and exporter, I want a pure, deterministic `renderFrame(project, t, opts)` function that composes `computeFrameState` and `drawFrame`, so that the same inputs always produce identical canvas output across preview, export, and tests.

#### Acceptance Criteria

1. THE Engine SHALL export `computeFrameState(project: Project, t: number, opts: ComputeOpts): FrameState` as a pure function with no canvas, DOM, `Date.now`, `Math.random`, or network access. `ComputeOpts` SHALL include a required `metricsProvider: TextMetricsProvider` and an optional `registry?: EffectRegistry` (defaults to the built-in registry). Node tests pass `FakeMetricsProvider`; Chromium tests pass `CanvasMetricsProvider`. WHEN `CanvasMetricsProvider` is used, the caller is responsible for ensuring fonts are loaded (e.g. by awaiting `document.fonts.ready`) before calling `computeFrameState`; the engine does not load fonts itself.
2. THE Engine SHALL export `drawFrame(ctx: CanvasRenderingContext2D, state: FrameState): void` as a thin painter that issues canvas draw calls based solely on `state`; it SHALL NOT perform interpolation, easing computation, or business logic. `drawFrame` SHALL paint every grapheme cluster with `ctx.textAlign = "left"` regardless of `LayerState.align`, because horizontal alignment is already resolved in `layoutX` by layout; `LayerState.align` remains copied verbatim from the layer as data and is not used by the painter. Blur effects are applied via `ctx.filter = 'blur(Npx)'` only when a segment's effective blur value is greater than `0`; `ctx.filter` is reset to `'none'` when it is not needed, rather than setting it unconditionally on every segment. `ctx.filter` support in `drawFrame` is verified exclusively in Chromium via the Playwright golden-image tests; correctness in other runtimes is not guaranteed.
3. THE Engine SHALL export `renderFrame(project: Project, t: number, opts?: RenderOpts): void` that calls `computeFrameState` and then `drawFrame` on the provided canvas context, and performs no other rendering work. `RenderOpts` SHALL include a `ctx: CanvasRenderingContext2D` and either an explicit `metricsProvider: TextMetricsProvider` or, if omitted, `renderFrame` SHALL construct a `CanvasMetricsProvider` from `ctx` automatically. `RenderOpts` SHALL also include an optional `registry?: EffectRegistry`.
4. WHEN `computeFrameState` is called with the same `project` and `t`, THE Engine SHALL return a `FrameState` that is deeply equal to every prior call with those same arguments (determinism property).
5. WHEN `computeFrameState` is called with any valid Project and any `t` in `[0, project.canvas.durationSeconds]`, THE Engine SHALL return a `FrameState` without throwing (total-function property).
6. WHEN `t` is less than `0`, THE Engine SHALL clamp `t` to `0` before computing the frame state.
7. WHEN `t` exceeds `project.canvas.durationSeconds`, THE Engine SHALL clamp `t` to `durationSeconds` before computing the frame state.
8. WHEN `t` is `NaN` or non-finite, THE Engine SHALL clamp `t` to `0` before computing the frame state.
9. THE `FrameState` type SHALL contain: `canvasWidth`, `canvasHeight`, `layers` (array of `LayerState`), and `warnings`. Each `LayerState` SHALL carry: `layerId` (string); `transform` (the layer-level resolved values from keyframe tracks: `positionOffset: [number, number]` (px), `scale: number`, `rotation: number` (degrees), `opacity: number` (0–1), `blur: number` (px), `colorOverride: HexColor | null` — null when no color track exists); and `segments` (array of base grapheme-cluster segments, each carrying: `text` (the grapheme cluster string), `charIndex` (0-based index in the layer text), `wordIndex`, `lineIndex`, `layoutX` (relative to layer anchor, in px, after per-line alignment offset per criterion 15), `layoutY` (relative to layer anchor, in px), `width` (in px), `height` (in px), and `effectOverrides` (a `SegmentOverrides` value that is the composed result of all effect instances targeting this segment, or null if no effects apply)). Color baseline is `layer.fill` unless a `color` keyframe track exists on the layer, in which case `LayerState.transform.colorOverride` holds the interpolated color and is used instead. `positionOffset` values are each in range −32000 to 32000 px as validated by the position track constraints. `drawFrame` compose order: (a) save canvas state; (b) translate to anchor + positionOffset; (c) rotate by layer rotation about layer center; (d) scale by layer scale about layer center; (e) set ctx.globalAlpha = layer opacity; (f) for each segment: save, translate to layoutX/layoutY, apply segment effectOverrides (if any) for positionOffset (add offset), scale, rotation about segment center, opacity (multiply with layer opacity, clamp to [0,1]), blur via ctx.filter, color (effectOverride.color overrides colorOverride which overrides fill), draw text with `ctx.textAlign = "left"` at the segment origin; (g) restore.
10. THE `FrameState` type SHALL be JSON-serialisable — it SHALL contain no `undefined`, `NaN`, `Infinity`, or function values. Negative zero (`-0`) SHALL be normalised to `0` before being stored in `FrameState`. Note: `JSON.stringify` silently converts `NaN` and `Infinity` to `null` without throwing, so the serialisability guarantee is verified by a round-trip test, not a stringify-no-throw test.
11. THE Engine SHALL interpolate KeyframeTrack values at layer-local time `tLocal` using the Easing defined in the active keyframe's `easing` field; for `tLocal` before the first keyframe the first value SHALL be used, and for `tLocal` after the last keyframe the last value SHALL be used.
12. `drawFrame` SHALL clear the canvas to the project background color before drawing any layer content. IF `background` is `"transparent"`, `drawFrame` SHALL clear the canvas to fully transparent using `ctx.clearRect` rather than filling with a color.
13. FOR ALL valid Projects, `computeFrameState` SHALL NOT throw regardless of what `applyEffect` returns or throws. WHEN `applyEffect` throws an `InvalidEffectParamsError`, THE Engine SHALL skip that effect for that segment and add an `InvalidEffectParamsWarning` to `FrameState.warnings`. WHEN `applyEffect` returns a `SegmentOverrides` containing a non-finite number (NaN or Infinity) for any property, THE Engine SHALL ignore that override for that property and add an `InvalidEffectParamsWarning` to `FrameState.warnings`.
14. WHEN `computeFrameState` evaluates a layer at time `t`, the layer is active if and only if `t >= layer.startSeconds AND t < layer.endSeconds`, OR (`t === layer.endSeconds AND layer.endSeconds === canvas.durationSeconds`). IF the layer is not active, it is omitted from `FrameState.layers` entirely. IF the layer is active, keyframe and effect evaluation use layer-local time `tLocal = t - layer.startSeconds`.
15. THE Engine SHALL resolve horizontal alignment in layout, per line, after wrapping by `maxWidth` (wrapping behaviour is unchanged and alignment applies to the wrapped lines). For each line, the extent SHALL be the right edge (`layoutX + width`, before the offset) of that line's last non-collapsible-whitespace (space, tab, CR, LF) grapheme cluster; trailing spaces and newline clusters do not count, and a line with no non-collapsible-whitespace cluster has extent `0`. Trailing `letterSpacing` after the last cluster is therefore excluded by construction. Each cluster's `layoutX` SHALL be shifted by an offset of `0` for `left`, `-extent / 2` for `center`, and `-extent` for `right`. Lines SHALL be aligned independently. Layout SHALL remain pure and deterministic with no DOM access.
16. THE Engine SHALL leave `ProjectSchema`, the `align` enum, `LayerState`, and `BaseSegment` shapes unchanged by criteria 2 and 15, and `CURRENT_PROJECT_VERSION` (`schemaVersion`) SHALL remain `1`, so that the studio preview and exporters consume `LayerState` and `BaseSegment` without modification.

### Requirement 6: Easing Interpolation Correctness

**User Story:** As an effect author, I want easing functions that stay within declared bounds and behave correctly at boundaries, so that animated properties never produce out-of-range values.

#### Acceptance Criteria

1. WHEN `linear` easing is applied to interpolate between values `a` and `b` at progress `p` in `[0, 1]`, THE Engine SHALL return a value in `[min(a,b), max(a,b)]`.
2. WHEN any named or parameterised easing (`easeIn`, `easeOut`, `easeInOut`, `cubicBezier`, `step`) is applied to interpolate between values `a` and `b` at progress `p` in `[0, 1]`, THE Engine SHALL return a value in `[min(a,b), max(a,b)]`.
3. WHEN `cubicBezier` easing is applied at progress `p = 0`, THE Engine SHALL return `a`; WHEN applied at `p = 1`, THE Engine SHALL return `b`.
4. WHEN `step` easing with `steps = N` is applied at progress `p` in `[0, 1)`, THE Engine SHALL return one of exactly `N` discrete values evenly spaced between `a` and `b`.
5. FOR ALL easing types, FOR ALL valid `(a, b, p)` inputs where `p` is in `[0, 1]`, the interpolated output SHALL be a finite number (no `NaN` or `Infinity`) (invariant property).
6. WHEN `step` easing with `steps = N` is applied at `p = 1`, THE Engine SHALL return exactly `b`.

### Requirement 7: Effect Registry

**User Story:** As an effect author, I want a central EffectRegistry that maps effect ids to their definitions, so that I can register new effects and have them available to `computeFrameState` without modifying core rendering code.

#### Acceptance Criteria

1. THE Engine SHALL export a `createRegistry(): EffectRegistry` factory function. The returned `EffectRegistry` SHALL expose a `register(definition: EffectDefinition): void` method and a `get(id: string): EffectDefinition | undefined` method.
2. WHEN `register` is called with a `EffectDefinition` whose `id` is already registered, THE Engine SHALL throw a typed `DuplicateEffectError` rather than silently overwriting the existing definition.
3. WHEN `get` is called with an id that is not registered, THE Engine SHALL return `undefined`.
4. THE `EffectDefinition` type SHALL contain: `id` (kebab-case string), `displayName` (string), `paramSchema` (Zod schema), and `applyEffect({ groupText, charIndex, wordIndex, lineIndex, groupIndex, groupCount, t, params, prng }): SegmentOverrides` — where `groupText` is the text of the group the effect targets (the full grapheme cluster string for character granularity; the word string for word granularity; the line string for line granularity), `charIndex` is the 0-based grapheme cluster index in the layer, `wordIndex` is the 0-based word index, `lineIndex` is the 0-based line index, `groupIndex` is the 0-based index within the effect's granularity group (e.g. if granularity is "word", this is the word number), `groupCount` is the total number of groups of the effect's granularity, `t` is the layer-local time in seconds (i.e. `tLocal = globalT - layer.startSeconds`), and `prng` is the per-segment PRNG derived by hashing `JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex])` with 32-bit FNV-1a.
5. WHEN `computeFrameState` processes an `EffectInstance` whose `effectId` is not found in the registry, THE Engine SHALL include a typed `UnknownEffectWarning` in the returned `FrameState.warnings` and render the segment with no effect applied, rather than throwing.
6. THE Engine SHALL export a `registerBuiltinEffects` function that registers all effects bundled with the engine package into a given registry; consumers call this once at startup.
7. THE Engine SHALL export a default built-in registry instance pre-populated by `registerBuiltinEffects`. This instance is the default value for the `registry` option in `ComputeOpts`; it is not a hidden global injected by module load side effects.

### Requirement 8: Adding an Effect — Contribution Procedure

**User Story:** As a contributor, I want a documented, enforced procedure for adding new effects, so that every effect follows the same file structure and testing contract.

#### Acceptance Criteria

1. THE Engine SHALL require every effect to live in `packages/engine/src/effects/<kebab-id>/` with at least three files: `index.ts` (effect implementation), `schema.ts` (Zod parameter schema), and one or more `*.test.ts` files (co-located unit and property-based tests). `index.ts` SHALL export a `register(registry: EffectRegistry): void` function and SHALL NOT call `register` at module load time (no side effects on import).
2. WHEN a new effect's `index.ts` is added, THE Engine SHALL export a `register(registry: EffectRegistry): void` function that registers the effect; the effect MUST NOT register itself at module load time.
3. THE `registerBuiltinEffects` function SHALL import and call every built-in effect's `register` function; adding a new built-in effect requires updating only `registerBuiltinEffects`.
4. THE Engine SHALL document the contribution procedure in `packages/engine/CONTRIBUTING.md`, listing the required files, the registration pattern, and the test requirements.
5. WHEN an effect's `*.test.ts` is run, THE Engine SHALL execute at least one property-based test using fast-check that calls `computeFrameState` with arbitrary valid inputs, a fresh registry created via `createRegistry()` with the effect registered, and the `FakeMetricsProvider`, and asserts the result is a valid `FrameState` without throwing.

### Requirement 9: Typewriter Reference Effect

**User Story:** As a user, I want a built-in typewriter effect that reveals characters one by one over a configurable duration, so that I can animate text entries without writing custom effects.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `typewriter` located at `packages/engine/src/effects/typewriter/`.
2. THE `typewriter` effect's `paramSchema` SHALL validate: `startDelay` (non-negative number in seconds, default `0`), `delayPerCharacter` (non-negative number in seconds), and `direction` (`forward` | `backward`). The effect begins revealing characters after `startDelay` seconds of layer-local time.
3. WHEN `direction` is `forward` and `applyEffect` is called with `{ groupText, groupIndex: i, t: tLocal, params }`, THE Engine SHALL return an opacity override of `1` if `tLocal >= params.startDelay + i * params.delayPerCharacter`, and `0` otherwise. The granularity for the typewriter effect is "character" (each grapheme cluster is its own group), so `groupIndex === charIndex`.
4. WHEN `direction` is `backward` and `applyEffect` is called with `{ groupText, groupIndex: i, groupCount: N, t: tLocal, params }`, THE Engine SHALL return an opacity override of `1` if `tLocal >= params.startDelay + (N - 1 - i) * params.delayPerCharacter`, and `0` otherwise.
5. IF `applyEffect` is called with params that fail the typewriter `paramSchema`, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError`.

### Requirement 10: Fade-Slide Reference Effect

**User Story:** As a user, I want a built-in fade-slide effect that fades in and slides text elements to their final position over a configurable duration, so that I can add smooth entrances without writing custom effects.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `fade-slide` located at `packages/engine/src/effects/fade-slide/`.
2. THE `fade-slide` effect's `paramSchema` SHALL validate: `durationSeconds` (positive number), `slideDistance` (number in pixels, may be negative), `slideAxis` (`x` | `y`), `delayPerSegment` (non-negative number in seconds), and `easing` (an EasingSchema value).
3. WHEN `applyEffect` is called with `{ groupText, groupIndex: i, t: tLocal, params }`, THE Engine SHALL compute `p = clamp((tLocal - i * params.delayPerSegment) / params.durationSeconds, 0, 1)`, then `eased = ease(p, params.easing)`, and return an opacity override of `eased` and a position override that offsets by `params.slideDistance * (1 - eased)` along `params.slideAxis`.
4. WHEN `eased` equals `1` (i.e. `p = 1`), THE Engine SHALL return an opacity override of exactly `1` and a position offset of exactly `0`.
5. IF `applyEffect` is called with params that fail the fade-slide `paramSchema`, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError`.

### Requirement 11: Property-Based Test Suite

**User Story:** As a contributor, I want a fast-check property-based test suite that runs in Node against `computeFrameState`, so that the engine's correctness properties are continuously verified across a wide input space.

#### Acceptance Criteria

1. THE Engine's test suite SHALL include a property-based test asserting that for any valid `Project` and any `t` in `[0, durationSeconds]`, `computeFrameState(project, t, { metricsProvider: FakeMetricsProvider })` returns a `FrameState` without throwing (total-function property).
2. THE Engine's test suite SHALL include a property-based test asserting that for the same `project` and `t`, two sequential calls to `computeFrameState` return deeply equal `FrameState` objects (determinism property).
3. THE Engine's test suite SHALL include a property-based test asserting that for any valid `(a, b, p)` triple with `p` in `[0, 1]`, every easing function returns a finite number (no `NaN` or `Infinity`) (easing invariant property).
4. THE Engine's test suite SHALL include a property-based test asserting that for any valid `Project` value `p`, `parseProject(serializeProject(p))` returns a value deeply equal to `p` (serialize/parse round-trip property).
5. THE Engine's test suite SHALL include a test that reads each fixture file from `packages/engine/src/testing/fixtures/`, calls `migrateProject` on each, and asserts the result passes `ProjectSchema.safeParse` (migration forward-compatibility property). This test uses committed JSON fixtures, not generated values.
6. THE Engine's test suite SHALL include a property-based test asserting that for any JSON value that is not a valid `Project`, `ProjectSchema.safeParse` returns `{ success: false }` and does not throw (invalid-input rejection property).
7. THE Engine's property-based tests SHALL use fast-check `Arbitrary` generators co-located in `packages/engine/src/testing/arbitraries.ts` and SHALL run under Vitest without browser or DOM access.
8. THE Engine's test suite SHALL achieve a passing state (zero failures) before any code is merged; a failing test MUST NOT be suppressed with `test.skip` unless accompanied by a linked issue.
9. THE Engine's test suite SHALL include a property-based test asserting that `computeFrameState(project, t)` returns deeply equal results regardless of the order in which different `t` values are computed — i.e. computing frame state at `t1` then `t2` produces the same result as computing `t2` alone (random-access determinism property).
10. THE Engine's test suite SHALL include a property-based test asserting that `computeFrameState(project, NaN)`, `computeFrameState(project, Infinity)`, and `computeFrameState(project, -Infinity)` each return a valid `FrameState` without throwing (non-finite `t` property).
11. THE Engine's test suite SHALL include a property-based test asserting that any `Project` input with canvas dimensions, fps, durationSeconds, layer count, text length, keyframe count, effect instance count, anchor coordinates, positionOffset values, fontSize, letterSpacing, or lineHeight exceeding the hard limits defined in Requirement 1 is rejected by `ProjectSchema.safeParse` with a `ZodError` and does not throw (hard-limits rejection property).
12. THE Engine's test suite SHALL include a property-based test asserting that for any valid Project and active layer at time `t`, the grapheme clusters produced by `Intl.Segmenter` with `granularity: "grapheme"` over `layer.text` match exactly the `segment.text` values in `LayerState.segments`, in order. Newline characters (`\n`) are assigned to their own grapheme cluster segment and counted as part of `charIndex` sequencing; they trigger a new line and do not appear in any word segment's text. No grapheme cluster is duplicated or omitted.
13. THE Engine's test suite SHALL include a property-based test asserting that for any valid Project and `t`, no resolved segment in the returned `FrameState` has an opacity outside `[0, 1]` (opacity bounds property).
14. THE Engine's test suite SHALL include a property-based test asserting that `JSON.parse(JSON.stringify(state))` is deeply equal to `state` for any `FrameState` produced by `computeFrameState` (JSON round-trip property). A companion unit test SHALL assert that a `FrameState` containing a `-0` value has that value normalised to `0`.
15. THE Engine's test suite SHALL include a property-based test asserting that for any valid typewriter params with `direction: "backward"`, `applyEffect` with `groupIndex: i`, `groupCount: N`, and `tLocal >= params.startDelay + (N - 1 - i) * params.delayPerCharacter` returns opacity `1`, and opacity `0` otherwise (typewriter backward direction property).
16. THE Engine's test suite SHALL include a property-based test asserting that for any valid Project with two layers having the same `project.seed` but different `layerId` values, and any effect instance index and segment index, the PRNG streams derived for those two layers are not equal — i.e. at least the first value from each PRNG differs (PRNG layer-independence property).
17. THE Engine's layout unit tests SHALL be updated to assert, with `FakeMetricsProvider`, the per-line alignment offsets of Requirement 5, criterion 15 for `left`, `center`, and `right`, including a line with trailing spaces, a line terminated by a newline cluster, a line with no non-collapsible-whitespace (space, tab, CR, LF) cluster (extent `0`), wrapped multi-line text with lines of differing widths, and a non-zero `letterSpacing`. A further unit test SHALL assert that a layer's `align` change produces a different layout cache key and that cached geometry for the previous `align` is not returned.
18. THE Engine's test suite SHALL include a property-based test over arbitrary `text`, `fontSize`, `letterSpacing`, `maxWidth`, and `align` using `FakeMetricsProvider`, asserting for every line of the resulting layout that contains at least one non-collapsible-whitespace (space, tab, CR, LF) cluster, including every line produced by `maxWidth` wrapping and by explicit `"\n"`, with `L` = the `layoutX` of the line's first cluster and `R` = `layoutX + width` of the line's last non-collapsible-whitespace cluster: for `center`, `|L + R| <= epsilon`; for `left`, `L` equals `0` within `epsilon`; for `right`, `R` equals `0` within `epsilon`. The generated `text` SHALL include leading spaces and multiple lines separated by `"\n"`, and `maxWidth` SHALL include values that wrap lines. Lines with no non-collapsible-whitespace cluster are skipped (alignment property). Separately, WHERE `letterSpacing >= 0` and the line's first cluster is non-collapsible-whitespace, the minimum `layoutX` over the line equals `L`, so the bounding-box form holds literally in that sub-domain: the line's bounding box is symmetric around the anchor for `center`, starts at the anchor for `left`, and ends at the anchor for `right`.
19. THE Engine's test suite SHALL include a unit test asserting that `drawFrame`, given a recording canvas context and a `LayerState` with `align` of `center` or `right`, never sets `ctx.textAlign` to any value other than `"left"` while painting segments.

### Requirement 12: Playwright Golden-Image Test Setup

**User Story:** As a contributor, I want a Playwright test that renders the two reference effects in Chromium and diffs against golden images, so that visual regressions in `drawFrame` are caught before merging.

#### Acceptance Criteria

1. THE Engine SHALL include Playwright tests in `tests/visual/` that render `typewriter` and `fade-slide` through `drawFrame` in a headless Chromium browser.
2. WHEN a Playwright visual test runs for the first time, THE Engine SHALL write a golden PNG to `tests/visual/__snapshots__/` for each test case.
3. WHEN a Playwright visual test runs after a golden PNG exists, THE Engine SHALL compare the rendered canvas to the golden PNG and fail the test if the pixel diff exceeds `maxDiffPixelRatio: 0.001`. Golden images are generated and compared on the same machine (CI or developer machine) to avoid cross-platform font differences.
4. THE Playwright test setup SHALL use only `drawFrame` and pre-computed `FrameState` fixtures; it SHALL NOT call `computeFrameState` or `renderFrame` in the visual test body, keeping the painter path isolated. `FrameState` fixtures are generated by a dedicated script (e.g. `scripts/generate-visual-fixtures.ts`) that calls `computeFrameState` with `FakeMetricsProvider` and commits the results as JSON. The Playwright tests load each `FrameState` fixture JSON and pass it directly to `drawFrame`. The test page is a small Vite application in `tests/visual/app/` that imports `drawFrame` from the engine package and exposes a `render(state)` function on `window`. Playwright's `webServer` config starts this Vite dev server before the test run. The test calls `page.evaluate(() => window.render(fixture))` and then captures a canvas screenshot.
5. THE Playwright visual tests SHALL run exclusively in Chromium to ensure deterministic font rendering and canvas output; they SHALL NOT run in Firefox or WebKit. Before drawing, the test page MUST self-host an OFL test font and await `document.fonts.ready` to ensure consistent text rendering. The visual test fixtures MUST include at least one project using a Tamil-capable OFL font (e.g. Noto Sans Tamil) to verify multi-codepoint grapheme cluster rendering. The font file is committed to `tests/visual/fonts/`.
6. IF a Playwright test fails due to a golden-image mismatch, THE Engine SHALL output the diff image path to the test report so contributors can inspect the regression.
7. THE existing golden images SHALL remain unchanged by the alignment amendment, because every existing golden fixture is left-aligned. IF any golden image changes as a result of a layout or painter change, THEN the change SHALL be reported, and regeneration of that golden SHALL be a deliberate, reported step and SHALL NOT occur automatically.

### Requirement 13: Static Analysis and Enforcement

**User Story:** As a contributor, I want ESLint and a Kiro hook to prevent banned calls in `packages/engine/src`, so that purity violations are caught before review.

#### Acceptance Criteria

1. THE Engine SHALL configure an ESLint `no-restricted-properties` (or `no-restricted-globals`) rule in `packages/engine/eslint.config.js` (ESLint 9 flat config format, using typescript-eslint) that raises an error for any use of `Math.random`, `Date.now`, and `performance.now` within `packages/engine/src/` (excluding the explicit timing utility file).
2. THE Engine SHALL include a Kiro hook (created via the Kiro Hooks UI) that triggers on `PostFileSave` for files matching `packages/engine/src/**`, runs ESLint on the saved file, and reports any failures. The hook SHALL NOT be described as blocking saves; it is a reporting hook. The exact hook file format and event name are determined by the Kiro Hooks UI and are not specified here.
3. WHEN the ESLint rule is active, any file in `packages/engine/src/` that calls `Math.random` SHALL produce an ESLint error that identifies the file and line number.

### Requirement 14: Dependency Declaration

**User Story:** As a maintainer, I want every third-party dependency logged in `docs/dependencies.md`, so that license compliance is auditable.

#### Acceptance Criteria

1. THE Engine SHALL install Zod v4 and use its native `z.toJSONSchema()` for JSON Schema generation. The `zod-to-json-schema` package SHALL NOT be used. `docs/dependencies.md` SHALL NOT contain an entry for `zod-to-json-schema`.
2. THE Engine SHALL add an entry to `docs/dependencies.md` for every direct dependency used in `packages/engine`, including: `zod` (MIT), `vitest` (MIT), `@playwright/test` (Apache-2.0), `eslint` (MIT), `typescript` (Apache-2.0), `fast-check` (MIT), `ajv` (MIT), `typescript-eslint` (MIT), and `vite` (MIT). Each entry SHALL include the package name, the actual version installed by pnpm (recorded at the time `pnpm add` is run, not a guessed range), the license, and the reason for use.

### Requirement 15: Layout Cache and Performance

**User Story:** As a consumer rendering a video at 30 fps, I want layout computation to be cached across frames so that per-frame cost stays low for layers whose text and style do not change.

#### Acceptance Criteria

1. THE Engine SHALL memoize the layout geometry produced by `layoutSegments` — the `layoutX` (including the alignment offset), `layoutY`, `width`, and `height` values per grapheme cluster — keyed by `JSON.stringify([layer.text, layer.fontFamily, layer.fontSize, layer.fontWeight, layer.letterSpacing, layer.lineHeight, layer.maxWidth, layer.align])`. The cached objects contain layout geometry only and are immutable; `effectOverrides` is never stored in the cache. On each call to `computeFrameState`, cached geometry is used to build fresh `BaseSegment` objects with `effectOverrides` computed for that frame. Identical inputs MUST return the cached geometry without re-measuring. The cached geometry objects MUST NOT be mutated after insertion. `computeFrameState` creates a new `BaseSegment` object per grapheme cluster each frame, copying cached geometry fields and computing `effectOverrides` fresh.
2. THE memoization cache SHALL be held inside the `ComputeOpts` object passed to `computeFrameState`, so that it is scoped to a single render session and does not leak between independent calls with different opts instances.
3. THE Engine's test suite SHALL include a Vitest benchmark (using `bench`) asserting that `computeFrameState` completes in under 4 ms for a project containing one 200-character layer with two effects applied at "character" granularity, using `FakeMetricsProvider` and a cold cache, running in Node.
4. THE benchmark SHALL be co-located with `compute.test.ts` in a file named `compute.bench.ts`.
