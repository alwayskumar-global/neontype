# Design Document

## Overview

The `engine-core` feature delivers the complete `packages/engine` package for the motion-text studio. It is a pure TypeScript library with zero runtime DOM dependencies (except for injected Canvas types), responsible for:

- **Zod schemas** — the single source of truth for `Project`, `EffectPack`, and all sub-types; JSON Schema files are generated from them at build time.
- **`renderFrame` pipeline** — composed of a pure data-computation function (`computeFrameState`) and a thin Canvas2D painter (`drawFrame`), together called by `renderFrame`.
- **Effect registry** — an in-memory map from kebab-case effect ids to `EffectDefinition` objects; no global singleton, created via `createRegistry()`.
- **Two reference effects** — `typewriter` and `fade-slide`, each in their own directory under `packages/engine/src/effects/`.
- **SeededPRNG** — mulberry32 seeded by a 32-bit FNV-1a hash; fully deterministic and cross-platform.
- **Schema versioning and migration** — `migrateProject` applies ordered migration steps; test fixtures committed per supported version.
- **Property-based test suite** — Vitest + fast-check running in Node, with `FakeMetricsProvider` to keep `computeFrameState` pure.
- **Playwright golden-image tests** — Chromium-only, driven by committed `FrameState` JSON fixtures, isolating `drawFrame`.

Everything described here lives exclusively in `packages/engine`; no exporter, embed, or studio code is in scope.

---

## Architecture

### Layered pipeline

```
Caller
  │
  ▼
renderFrame(project, t, opts?)             ← public composition entry point
  │
  ├─► computeFrameState(project, t, opts)  ← pure: data in → data out; Node-safe
  │       │
  │       ├─ clamp t (NaN/±Inf/out-of-range → 0 or durationSeconds)
  │       ├─ evaluate active layers (half-open [start, end); end==duration → inclusive)
  │       ├─ per-layer: compute tLocal, interpolate KeyframeTracks → LayerState.transform
  │       ├─ per-layer: segment text via Intl.Segmenter → BaseSegment[] (charIndex/wordIndex/lineIndex)
  │       ├─ per-layer: layout grapheme clusters (layoutX/layoutY/width/height via TextMetricsProvider)
  │       ├─ per-segment: derive PRNG, apply effects, compose SegmentOverrides → effectOverrides
  │       ├─ normalise -0 → 0 in all number fields
  │       └─ return FrameState (JSON-serialisable, no undefined/NaN/Inf/fn)
  │
  └─► drawFrame(ctx, state)                ← thin painter; Canvas2D only; no logic
          │
          ├─ clear background (fill or clearRect for transparent)
          └─ per layer:
               (a) save canvas state
               (b) translate to anchor + positionOffset
               (c) rotate by layer rotation about layer center
               (d) scale by layer scale about layer center
               (e) set ctx.globalAlpha = layer opacity
               (f) per segment: save, translate to layoutX/layoutY,
                   apply effectOverrides (positionOffset add, scale/rotation about segment center,
                   opacity multiply+clamp, blur: set `ctx.filter = 'blur(Npx)'` only when effective blur > 0, otherwise set `ctx.filter = 'none'` (avoids per-glyph filter overhead when blur is zero),
                   color: effectOverride.color → colorOverride → fill), draw text
               (g) restore
```

### Dependency graph

```
packages/engine        ← this package; no runtime deps on exporters/embed/studio
  ├─ zod               (schema definition + JSON Schema generation)
  ├─ ajv               (dev: JSON Schema validation in tests)
  ├─ fast-check        (dev: PBT arbitraries)
  ├─ vitest            (dev: test runner)
  ├─ @playwright/test  (dev: golden-image tests)
  └─ eslint            (dev: purity enforcement)

packages/exporters     depends on packages/engine only
packages/embed         depends on packages/engine only
apps/studio            depends on all packages; owns no render logic
```

---

## Components and Interfaces

### Core TypeScript types

```typescript
// ── Primitive geometry ──────────────────────────────────────────────
type HexColor = string;   // e.g. "#ff00aa"; validated by Zod regex
type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | { type: "cubicBezier"; x1: number; y1: number; x2: number; y2: number }
  | { type: "step"; steps: number };

// ── Project document ────────────────────────────────────────────────
interface Canvas {
  width: number;          // 1–7680 px
  height: number;         // 1–4320 px
  fps: number;            // 1–120
  durationSeconds: number; // 0.1–600
}

interface Keyframe {
  t: number;              // layer-local seconds, ≥ 0
  value: KeyframeValue;   // typed per property
  easing: Easing;         // curve leaving this keyframe; last kf's easing ignored
}

type KeyframeProperty =
  | "position" | "scale" | "rotation"
  | "opacity"  | "blur"  | "color";

type KeyframeValue =
  | [number, number]  // position [x, y] px
  | number            // scale (unitless) | rotation (degrees) | opacity (unitless) | blur (px)
  | HexColor;         // color

interface KeyframeTrack {
  property: KeyframeProperty;
  keyframes: Keyframe[];   // min 1; strictly increasing t; max 500
}

interface EffectInstance {
  effectId: string;       // kebab-case
  granularity: "character" | "word" | "line";
  params: Record<string, unknown>;
}

interface TextLayer {
  id: string;
  text: string;           // 1–2000 chars
  tracks: KeyframeTrack[];
  effectInstances: EffectInstance[]; // max 16
  fontFamily: string;
  fontSize: number;       // px > 0, max 1000
  fontWeight: string;     // e.g. "400" | "bold"
  fill: HexColor;
  align: "left" | "center" | "right";
  letterSpacing: number;  // px, default 0, range -500..500
  lineHeight: number;     // multiplier > 0, range 0.1–10, default 1.2
  maxWidth: number | null;
  startSeconds: number;   // ≥ 0
  endSeconds: number;     // > startSeconds, ≤ canvas.durationSeconds
  anchor: { x: number; y: number }; // canvas coords in px, each -32000..32000; default = canvas center
}

interface Project {
  schemaVersion: number;
  canvas: Canvas;
  background: HexColor | "transparent";
  seed: number;
  layers: TextLayer[];    // max 64
}

// ── EffectPack ───────────────────────────────────────────────────────
interface ParamDescriptorBase {
  key: string;
  binding: { effectInstanceIndex: number; paramKey: string };
}
type ParamDescriptor =
  | (ParamDescriptorBase & { type: "number"; min: number; max: number; default: number })
  | (ParamDescriptorBase & { type: "enum"; values: string[]; default: string })
  | (ParamDescriptorBase & { type: "color"; default: HexColor });

interface EffectPack {
  schemaVersion: number;
  id: string;             // kebab-case
  displayName: string;
  description: string;
  effectInstances: Array<{ effectId: string; granularity: "character" | "word" | "line"; params: Record<string, unknown> }>;
  paramDescriptors: ParamDescriptor[];
}

// ── FrameState ───────────────────────────────────────────────────────
interface FontSpec {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: number;
}

interface BaseSegment {
  text: string;           // grapheme cluster (may be multi-codepoint)
  charIndex: number;      // 0-based index in layer text
  wordIndex: number;      // 0-based word index
  lineIndex: number;      // 0-based line index
  layoutX: number;        // px relative to layer anchor
  layoutY: number;        // px relative to layer anchor
  width: number;          // px
  height: number;         // px
  effectOverrides: SegmentOverrides | null; // composed result of all effects, or null
}

interface LayerState {
  layerId: string;
  fill: HexColor;          // layer fill color, copied verbatim from the layer
  fontFamily: string;      // copied verbatim from the layer
  fontSize: number;        // px, copied verbatim from the layer
  fontWeight: string;      // copied verbatim from the layer
  align: "left" | "center" | "right"; // copied verbatim from the layer
  anchor: { x: number; y: number };   // fresh plain object copied from the layer
  letterSpacing: number;   // px, copied verbatim from the layer
  lineHeight: number;      // multiplier, copied verbatim from the layer
  transform: {
    positionOffset: [number, number]; // px offset from anchor, from position track; default [0,0]
    scale: number;
    rotation: number;       // degrees
    opacity: number;        // [0, 1]
    blur: number;           // px
    colorOverride: HexColor | null;   // null if no color track
  };
  segments: BaseSegment[];
}

interface FrameState {
  canvasWidth: number;
  canvasHeight: number;
  background: HexColor | "transparent"; // project background, copied verbatim
  layers: LayerState[];
  warnings: EngineWarning[];
}

// ── Warnings ─────────────────────────────────────────────────────────
type UnknownEffectWarning    = { type: "UnknownEffect";    effectId: string; layerId: string };
type InvalidEffectParamsWarning = { type: "InvalidEffectParams"; effectId: string; layerId: string; segmentIndex: number };
type EngineWarning = UnknownEffectWarning | InvalidEffectParamsWarning;

// ── Typed errors ─────────────────────────────────────────────────────
class ParseError extends Error {
  readonly code: "PARSE_ERROR" | "SIZE_LIMIT_EXCEEDED";
  readonly cause?: unknown;
}
class MigrationError extends Error {
  readonly code: "FUTURE_VERSION";
  readonly version: number;
}
class DuplicateEffectError extends Error {
  readonly effectId: string;
}
class InvalidEffectParamsError extends Error {
  readonly effectId: string;
  readonly cause: unknown; // ZodError
}

// ── PRNG ─────────────────────────────────────────────────────────────
interface PRNG {
  next(): number; // [0, 1)
}

// ── TextMetricsProvider ──────────────────────────────────────────────
interface TextMetricsProvider {
  measure(text: string, fontSpec: FontSpec): { width: number; ascent: number; descent: number };
}

// ── EffectDefinition and EffectRegistry ─────────────────────────────
interface SegmentOverrides {
  positionOffset?: [number, number]; // px, additive offset relative to layoutX/Y
  scale?: number;
  rotation?: number;     // degrees
  opacity?: number;      // [0,1], multiplied with layer opacity and clamped
  blur?: number;         // px
  color?: HexColor;
}

interface ApplyEffectArgs {
  groupText: string;    // text of the group the effect targets (full grapheme cluster string for character granularity; word string for word granularity; line string for line granularity)
  charIndex: number;
  wordIndex: number;
  lineIndex: number;
  groupIndex: number;
  groupCount: number;
  t: number;
  params: Record<string, unknown>;
  prng: PRNG;
}

interface EffectDefinition {
  id: string;           // kebab-case
  displayName: string;
  paramSchema: ZodType; // Zod schema for params
  applyEffect(args: ApplyEffectArgs): SegmentOverrides;
}

interface EffectRegistry {
  register(definition: EffectDefinition): void;
  get(id: string): EffectDefinition | undefined;
}

// ── ComputeOpts / RenderOpts ─────────────────────────────────────────
interface ComputeOpts {
  metricsProvider: TextMetricsProvider;
  registry?: EffectRegistry;  // defaults to built-in registry instance
  layoutCache?: Map<string, LayoutGeometry[]>; // optional; auto-created if omitted; geometry-only, immutable entries
}

interface RenderOpts {
  ctx: CanvasRenderingContext2D;
  metricsProvider?: TextMetricsProvider; // defaults to CanvasMetricsProvider(ctx)
  registry?: EffectRegistry;
}

// ── Migration ────────────────────────────────────────────────────────
type MigrationFn  = (raw: Record<string, unknown>) => Record<string, unknown>;
type MigrationMap = Map<number, MigrationFn>;
```

### Public API surface (`packages/engine/src/index.ts`)

| Export | Kind | Description |
|---|---|---|
| `ProjectSchema` | Zod schema | Full project document validator |
| `TextLayerSchema` | Zod schema | Single text layer |
| `KeyframeTrackSchema` | Zod schema | Single keyframe track |
| `KeyframeSchema` | Zod schema | Single keyframe |
| `EasingSchema` | Zod schema | Easing union |
| `EffectInstanceSchema` | Zod schema | Effect instance ref |
| `EffectPackSchema` | Zod schema | Effect pack document |
| `CURRENT_PROJECT_VERSION` | `number` | Latest `schemaVersion` |
| `serializeProject` | function | `Project → string` |
| `parseProject` | function | `string → Project \| ParseError` |
| `migrateProject` | function | `(raw, migrations?) → Project \| MigrationError` |
| `computeFrameState` | function | Pure `(Project, t, ComputeOpts) → FrameState` |
| `drawFrame` | function | Painter `(ctx, FrameState) → void` |
| `renderFrame` | function | Composition `(Project, t, RenderOpts?) → void` |
| `createRegistry` | function | Factory `() → EffectRegistry` |
| `registerBuiltinEffects` | function | Populates a registry with bundled effects |
| `createPRNG` | function | `(seed: number) → PRNG` |
| `ParseError`, `MigrationError`, `DuplicateEffectError`, `InvalidEffectParamsError` | classes | Typed errors |

---

## Data Models

### Zod Schema Design

#### `EasingSchema`

```typescript
const CubicBezierSchema = z.object({
  type: z.literal("cubicBezier"),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
  x2: z.number().min(0).max(1),
  y2: z.number().min(0).max(1),
});

const StepSchema = z.object({
  type: z.literal("step"),
  steps: z.number().int().positive(),
});

const EasingSchema = z.union([
  z.literal("linear"),
  z.literal("easeIn"),
  z.literal("easeOut"),
  z.literal("easeInOut"),
  CubicBezierSchema,
  StepSchema,
]);
```

#### `KeyframeSchema` and `KeyframeTrackSchema`

The `value` field is a discriminated union per `property`. Because `KeyframeSchema` cannot know the property without context, the per-property validation is enforced in `KeyframeTrackSchema` via `.superRefine()`, which checks that each keyframe's value matches the declared property type. A single generic `KeyframeSchema` exports the base structure; the refined version is used internally when building `KeyframeTrackSchema`.

Cross-field checks in `KeyframeTrackSchema.superRefine()`:
- Keyframe `t` values are strictly increasing (each `kf[i].t > kf[i-1].t`).
- Keyframe values conform to the track's `property` type.

#### `TextLayerSchema` cross-field checks (`.superRefine()`)

```
startSeconds >= 0
endSeconds > startSeconds
endSeconds <= canvas.durationSeconds          ← validated at Project level (see below)
for each track: for each keyframe:
  kf.t in [0, endSeconds - startSeconds]
```

Because `endSeconds ≤ canvas.durationSeconds` is a cross-document constraint (layer references canvas), this check lives in `ProjectSchema.superRefine()` over each layer using access to `project.canvas.durationSeconds`.

#### `ProjectSchema` cross-field checks (`.superRefine()`)

```
for each layer:
  layer.endSeconds <= canvas.durationSeconds
  layer.startSeconds < layer.endSeconds
  for each track, for each kf:
    kf.t <= layer.endSeconds - layer.startSeconds
```

Note: `anchor.x`, `anchor.y`, position keyframe values, `fontSize`, `letterSpacing`, and `lineHeight` are validated against their numeric ranges within their respective field schemas (not requiring cross-field superRefine).

Size limit: `parseProject` checks `new TextEncoder().encode(json).byteLength > 5_242_880` before calling `safeParse` and returns a `ParseError` with `code: "SIZE_LIMIT_EXCEEDED"`.

#### `EffectPackSchema` cross-field checks (`.superRefine()`)

```
for each paramDescriptor:
  binding.effectInstanceIndex < effectInstances.length
```

Size limit: EffectPack inputs are checked for `> 1_048_576` bytes before parsing.

#### Hex color validation

All `HexColor` fields use a shared Zod refinement:

```typescript
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color");
const BackgroundSchema = z.union([HexColorSchema, z.literal("transparent")]);
```

#### JSON Schema generation

The build-time script `packages/engine/scripts/generate-schemas.ts` calls `z.toJSONSchema(ProjectSchema)`, `z.toJSONSchema(EffectPackSchema)`, and `z.toJSONSchema(effectDef.paramSchema)` for every built-in effect, then writes the results to `packages/engine/schema/`. The schema staleness test re-runs the script in memory and deep-compares against the committed files.

---

### Directory structure

```
packages/engine/
├── src/
│   ├── index.ts                         ← public re-exports
│   ├── schemas/
│   │   ├── project.ts                   ← ProjectSchema, TextLayerSchema, etc.
│   │   ├── keyframe.ts                  ← KeyframeSchema, KeyframeTrackSchema, EasingSchema
│   │   ├── effect-instance.ts           ← EffectInstanceSchema
│   │   ├── effect-pack.ts               ← EffectPackSchema, ParamDescriptor types
│   │   └── constants.ts                 ← CURRENT_PROJECT_VERSION
│   ├── serialize.ts                     ← serializeProject, parseProject
│   ├── migrate.ts                       ← migrateProject, MigrationMap, migration step fns
│   ├── prng.ts                          ← createPRNG (mulberry32), fnv1a32, derivePRNG
│   ├── easing.ts                        ← evaluate(easing, a, b, p): number
│   ├── interpolate.ts                   ← interpolateTrack(track, tLocal): KeyframeValue
│   ├── segment.ts                       ← grapheme cluster segmentation via `Intl.Segmenter`; produces `BaseSegment[]` with charIndex/wordIndex/lineIndex
│   ├── layout.ts                        ← computes layoutX/layoutY/width/height per grapheme cluster using TextMetricsProvider; memoized by JSON.stringify key of (text, fontSpec fields, maxWidth); geometry-only cache, immutable
│   ├── compute.ts                       ← computeFrameState
│   ├── compute.bench.ts                 ← Vitest benchmark for computeFrameState performance
│   ├── draw.ts                          ← drawFrame
│   ├── render.ts                        ← renderFrame
│   ├── registry.ts                      ← createRegistry, EffectRegistry, EffectDefinition types
│   ├── metrics.ts                       ← TextMetricsProvider interface, CanvasMetricsProvider, FakeMetricsProvider
│   ├── errors.ts                        ← ParseError, MigrationError, DuplicateEffectError, InvalidEffectParamsError
│   ├── effects/
│   │   ├── index.ts                     ← registerBuiltinEffects, default registry instance
│   │   ├── typewriter/
│   │   │   ├── index.ts                 ← register(registry), applyEffect impl
│   │   │   ├── schema.ts                ← TypewriterParamsSchema
│   │   │   └── typewriter.test.ts
│   │   └── fade-slide/
│   │       ├── index.ts                 ← register(registry), applyEffect impl
│   │       ├── schema.ts                ← FadeSlideParamsSchema
│   │       └── fade-slide.test.ts
│   └── testing/
│       ├── arbitraries.ts               ← fast-check Arbitrary generators
│       ├── fake-metrics.ts              ← FakeMetricsProvider
│       └── fixtures/
│           └── project-v1.json          ← one committed fixture per schema version
├── scripts/
│   └── generate-schemas.ts             ← build-time JSON Schema generation
├── schema/
│   ├── project.json                    ← generated; do not edit manually
│   └── effect-pack.json                ← generated; do not edit manually
├── tests/
│   └── visual/
│       ├── app/                        ← Vite test page; imports drawFrame, self-hosts fonts, exposes window.render
│       ├── draw-frame.spec.ts          ← Playwright golden tests (Chromium only)
│       ├── __snapshots__/              ← committed golden PNGs
│       └── fixtures/                   ← committed FrameState JSON fixtures
├── scripts/
│   └── generate-visual-fixtures.ts     ← calls computeFrameState with FakeMetricsProvider
├── CONTRIBUTING.md
├── package.json
├── tsconfig.json
├── eslint.config.js                    ← ESLint 9 flat config; no-restricted-properties rules
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Project serialize / parse round-trip

*For any* valid `Project` value `p`, `parseProject(serializeProject(p))` SHALL return a value deeply equal to `p`.

**Validates: Requirements 1.9**

---

### Property 2: EffectPack JSON round-trip

*For any* valid `EffectPack` value `ep`, `EffectPackSchema.safeParse(JSON.parse(JSON.stringify(ep)))` SHALL succeed and produce a value deeply equal to `ep`.

**Validates: Requirements 3.6**

---

### Property 3: `computeFrameState` total function

*For any* valid `Project` and any `t` in `[0, project.canvas.durationSeconds]`, `computeFrameState(project, t, { metricsProvider: FakeMetricsProvider })` SHALL return a `FrameState` without throwing.

**Validates: Requirements 5.5, 11.1**

---

### Property 4: `computeFrameState` determinism

*For any* valid `Project` and any `t`, two sequential calls to `computeFrameState` with the same arguments SHALL return deeply equal `FrameState` objects.

**Validates: Requirements 5.4, 11.2**

---

### Property 5: `computeFrameState` random-access determinism

*For any* valid `Project` and any two time values `t1`, `t2`, computing `computeFrameState(project, t2)` alone SHALL return the same result as computing `computeFrameState(project, t1)` followed by `computeFrameState(project, t2)`.

**Validates: Requirements 11.9**

---

### Property 6: Non-finite `t` handled safely

*For any* valid `Project`, calling `computeFrameState(project, NaN)`, `computeFrameState(project, Infinity)`, and `computeFrameState(project, -Infinity)` SHALL each return a valid `FrameState` without throwing.

**Validates: Requirements 5.8, 11.10**

---

### Property 7: Easing invariant — finite output

*For any* easing type and any valid `(a, b, p)` where `p` is in `[0, 1]`, `evaluate(easing, a, b, p)` SHALL return a finite number (no `NaN` or `Infinity`).

**Validates: Requirements 6.5, 11.3**

---

### Property 8: PRNG determinism

*For any* integer `seed`, `createPRNG(seed).next()` called `N` times SHALL produce the same sequence of values as a fresh `createPRNG(seed)` called `N` times, across all calls in the same runtime.

**Validates: Requirements 4.2**

---

### Property 9: FrameState JSON round-trip

*For any* `FrameState` produced by `computeFrameState`, `JSON.parse(JSON.stringify(state))` SHALL be deeply equal to `state`.

**Validates: Requirements 5.10, 11.14**

---

### Property 10: Opacity bounds invariant

*For any* valid `Project` and any `t`, no resolved segment in the returned `FrameState` SHALL have an `opacity` value outside `[0, 1]`.

**Validates: Requirements 11.13**

---

### Property 11: Grapheme cluster completeness invariant

*For any* valid `Project` and active layer at time `t`, the grapheme clusters produced by `Intl.Segmenter` with `granularity: "grapheme"` over `layer.text` SHALL match exactly the `segment.text` values in `LayerState.segments`, in order. Newline characters (`\n`) are assigned to their own grapheme cluster segment and counted as part of `charIndex` sequencing; they trigger a new line and do not appear in any word segment's text. No grapheme cluster is duplicated or omitted.

**Validates: Requirements 11.12**

---

### Property 12: Hard-limits rejection

*For any* `Project`-like input where canvas dimensions, fps, durationSeconds, layer count, text length, keyframe count, or effect-instance count exceeds the defined hard limits, `ProjectSchema.safeParse` SHALL return `{ success: false }` and SHALL NOT throw.

**Validates: Requirements 11.11**

---

### Property 13: Invalid-input rejection is safe

*For any* JSON value that is not a valid `Project`, `ProjectSchema.safeParse` SHALL return `{ success: false }` and SHALL NOT throw.

**Validates: Requirements 11.6**

---

### Property 14: Typewriter opacity correctness (forward direction)

*For any* valid typewriter `params` and any segment `groupIndex` `i` out of `groupCount` `N` characters, `applyEffect({ ..., groupIndex: i, t: tLocal, params, direction: "forward" })` SHALL return opacity `1` if `tLocal >= params.startDelay + i * params.delayPerCharacter`, and `0` otherwise.

**Validates: Requirements 9.3**

---

### Property 15: Fade-slide boundary condition

*For any* valid fade-slide params, when `p = 1` (i.e. the animation has completed), `applyEffect` SHALL return opacity exactly `1` and position offset exactly `[0, 0]` (no residual slide).

**Validates: Requirements 10.4**

---

### Property 16: Typewriter opacity correctness (backward direction)

*For any* valid typewriter `params` with `direction: "backward"` and any segment `groupIndex` `i` out of `groupCount` `N` characters, `applyEffect({ ..., groupIndex: i, groupCount: N, t: tLocal, params })` SHALL return opacity `1` if `tLocal >= params.startDelay + (N - 1 - i) * params.delayPerCharacter`, and `0` otherwise.

**Validates: Requirements 9.4, 11.15**

---

### Property 17: PRNG layer independence

*For any* two distinct `layerId` strings `A` and `B` and the same `(seed, effectInstanceIndex, granularity, segmentIndex)`, `createPRNG(fnv1a32(JSON.stringify([seed, A, ...])))` and `createPRNG(fnv1a32(JSON.stringify([seed, B, ...])))` SHALL produce different sequences (i.e. their first `next()` values differ).

**Validates: Requirements 11.16**

---

## Error Handling

### Input validation strategy

All external input (project JSON, effect pack JSON) enters through Zod `safeParse`. The engine never throws on invalid external input; it returns typed error objects (`ParseError`, `MigrationError`). Internal invariant violations (duplicate effect registration, invalid effect params at `applyEffect` call time) use typed `throw` so the caller can distinguish programming errors from data errors.

| Input path | Size check | Parser | On failure |
|---|---|---|---|
| `parseProject(json)` | > 5 MB → `ParseError` | `ProjectSchema.safeParse` | `ParseError` |
| `migrateProject(raw)` | none | `ProjectSchema.safeParse` on final | `MigrationError` |
| EffectPack (future) | > 1 MB → typed error | `EffectPackSchema.safeParse` | typed error |
| `applyEffect` params | — | effect's `paramSchema.safeParse` | `InvalidEffectParamsError` (thrown) |

### Effect error isolation

`computeFrameState` wraps each `applyEffect` call in a `try/catch`. When `applyEffect` throws `InvalidEffectParamsError` or any other error, the segment is rendered with no effect applied and a warning is pushed to `FrameState.warnings`. If the returned `SegmentOverrides` contains a non-finite number, that individual property override is discarded (not the whole override object) and a warning is added.

### SegmentOverrides composition rules

After all effect instances for a segment are applied, overrides are composed as follows:

| Property | Composition rule |
|---|---|
| `opacity` | Multiply all override values together; clamp result to `[0, 1]` |
| `positionOffset` | Add all override `[dx, dy]` pairs to the keyframe-interpolated baseline |
| `scale`, `rotation`, `blur`, `color` | Last-writer-wins (last effect in `effectInstances` array) |

Keyframe-interpolated values serve as the baseline. Effect overrides layer on top.

### `-0` normalisation

Before returning `FrameState`, a shallow recursive pass replaces every `Object.is(v, -0)` value with `+0`. This is implemented as a small utility `normalise(val)` called on the assembled `FrameState` object.

### Migration errors

`migrateProject` returns a `MigrationError` (not throws) when `schemaVersion > CURRENT_PROJECT_VERSION`. This is a recoverable data error (the user needs a newer engine version), not a programming error.

---

## Performance

### Layout caching

Text layout (grapheme segmentation + metric measurement) is the most expensive step in `computeFrameState` when a layer's text and style are unchanged across frames. The layout geometry (per-cluster `layoutX`, `layoutY`, `width`, `height`) produced by `layoutSegments` is memoized. Cached objects are immutable and contain geometry only — `effectOverrides` is never stored. On each `computeFrameState` call, fresh `BaseSegment` objects are constructed by copying cached geometry and computing `effectOverrides` for that frame.

```typescript
interface ComputeOpts {
  metricsProvider: TextMetricsProvider;
  registry?: EffectRegistry;
  layoutCache?: Map<string, LayoutGeometry[]>; // optional; auto-created if omitted
}
```

The cache key is `JSON.stringify([text, fontFamily, fontSize, fontWeight, letterSpacing, lineHeight, maxWidth])`. `metricsProvider` identity is not included in the key string; callers who switch providers between frames must pass a fresh `ComputeOpts`.

The cache is a plain `Map` — no WeakRef or LRU eviction. Callers are responsible for clearing or replacing it when the project changes. For video rendering, the same opts object is reused across all frames of a single export pass.

Because cached objects are immutable geometry, they are safe to reference from multiple frames without cloning. Only the `BaseSegment` wrappers (which include `effectOverrides`) are created fresh per frame.

### Per-segment PRNG seeds

PRNG seeds are derived synchronously via FNV-1a on first use per segment. Because mulberry32 is stateless between calls (a fresh PRNG is created each time), there is no persistent state to cache.

### Benchmark

`compute.bench.ts` uses Vitest's `bench` API:

```typescript
bench("computeFrameState — 200 chars, 2 effects, cold cache", () => {
  computeFrameState(project200, 0.5, { metricsProvider: FakeMetricsProvider });
}, { time: 500 }); // target: < 4 ms mean
```

The project fixture (`project200`) is defined at the top of the file with 200-character text and two character-granularity effects. The FakeMetricsProvider returns synchronously with a fixed advance. A new `ComputeOpts` (fresh cache) is created inside each `bench` iteration.

---

## Testing Strategy

### Unit tests

Co-located `*.test.ts` files exercise specific examples, edge cases, and error conditions:

- `schemas/project.test.ts` — valid/invalid project fixtures; cross-field `superRefine` edge cases; cubicBezier control-point boundary values; size-limit rejection.
- `serialize.test.ts` — `serializeProject` / `parseProject` with known values; size-limit rejection with a 5 MB + 1 byte string.
- `migrate.test.ts` — reads every fixture in `testing/fixtures/`, calls `migrateProject`, asserts `ProjectSchema.safeParse` succeeds.
- `prng.test.ts` — known seed → known first `N` values (regression against mulberry32 reference).
- `easing.test.ts` — boundary conditions: `p=0` returns `a`, `p=1` returns `b` for all easing types; `step` discrete count.
- `compute.test.ts` — specific layer visibility boundary cases; `tLocal` calculation; keyframe interpolation examples.
- `draw.test.ts` — `drawFrame` with a mock `CanvasRenderingContext2D` (spy object); verifies `clearRect` is called for transparent background; verifies `ctx.filter` is set for blur > 0.
- `registry.test.ts` — `DuplicateEffectError` on re-registration; `get` returns `undefined` for unknown id.
- `effects/typewriter/typewriter.test.ts` — forward/backward opacity at specific `tLocal` values; `InvalidEffectParamsError` on bad params.
- `effects/fade-slide/fade-slide.test.ts` — `p=0` → full offset, `p=1` → zero offset; `InvalidEffectParamsError` on bad params.

### Property-based tests (fast-check, Node, Vitest)

All property-based tests live in co-located `*.test.ts` files or `compute.test.ts`. They use `Arbitrary` generators from `testing/arbitraries.ts` and `FakeMetricsProvider` from `testing/fake-metrics.ts`. Minimum 100 runs per property.

Each test is tagged:
```typescript
// Feature: engine-core, Property N: <property text>
```

| Property # | Test file | fast-check Arbitrary |
|---|---|---|
| 1 | `serialize.test.ts` | `arbValidProject` |
| 2 | `schemas/effect-pack.test.ts` | `arbValidEffectPack` |
| 3 | `compute.test.ts` | `arbValidProject` × `arbT` |
| 4 | `compute.test.ts` | `arbValidProject` × `arbT` |
| 5 | `compute.test.ts` | `arbValidProject` × `arbT` × `arbT` |
| 6 | `compute.test.ts` | `arbValidProject` |
| 7 | `easing.test.ts` | `arbEasing` × `fc.float` × `fc.float` × `fc.float({min:0,max:1})` |
| 8 | `prng.test.ts` | `fc.integer` |
| 9 | `compute.test.ts` | derived from Property 3 |
| 10 | `compute.test.ts` | `arbValidProject` × `arbT` |
| 11 | `compute.test.ts` | `arbValidProject` × `arbT` (character granularity effects only) |
| 12 | `schemas/project.test.ts` | `arbOutOfBoundsProject` |
| 13 | `schemas/project.test.ts` | `fc.anything()` |
| 14 | `effects/typewriter/typewriter.test.ts` | `arbTypewriterParams` × `fc.nat` × `fc.float` |
| 15 | `effects/fade-slide/fade-slide.test.ts` | `arbFadeSlideParams` |
| 16 | `effects/typewriter/typewriter.test.ts` | `arbTypewriterBackwardParams` × `fc.nat` × `fc.nat` × `fc.float` |
| 17 | `prng.test.ts` | `fc.integer` × `fc.string` × `fc.string` |

### Arbitrary generators (`testing/arbitraries.ts`)

Key generators:

```typescript
arbHexColor: fc.Arbitrary<HexColor>
arbEasing: fc.Arbitrary<Easing>
arbKeyframe(property): fc.Arbitrary<Keyframe>
arbKeyframeTrack: fc.Arbitrary<KeyframeTrack>
arbTextLayer(canvasDuration): fc.Arbitrary<TextLayer>
arbValidProject: fc.Arbitrary<Project>
arbOutOfBoundsProject: fc.Arbitrary<unknown>   // deliberately exceeds hard limits
arbValidEffectPack: fc.Arbitrary<EffectPack>
arbT(project): fc.Arbitrary<number>            // uniform in [0, durationSeconds]
arbTypewriterParams: fc.Arbitrary<TypewriterParams>
arbFadeSlideParams: fc.Arbitrary<FadeSlideParams>
arbGraphemeText: fc.Arbitrary<string>          // strings with ASCII, emoji, and Tamil chars; exercises Intl.Segmenter
```

`arbValidProject` generates projects where:
- All cross-field constraints are already satisfied (layer timing bounds, keyframe `t` range).
- `seed` is an arbitrary safe integer.
- Each `TextLayer.text` is generated by `fc.string({ minLength: 1, maxLength: 2000 })`.

### Playwright golden tests (Chromium only)

Setup:
1. `scripts/generate-visual-fixtures.ts` runs `computeFrameState` with `FakeMetricsProvider` for a set of representative `(effect, t)` pairs and writes JSON files to `tests/visual/fixtures/`.
2. These fixture files are committed to the repository.
3. A small Vite app in `tests/visual/app/` imports `drawFrame` from the engine package and exposes `window.render(state: FrameState): void`. The app self-hosts OFL fonts from `tests/visual/fonts/` and awaits `document.fonts.ready` before resolving a `window.fontsReady` promise.
4. `playwright.config.ts` sets `webServer: { command: "vite tests/visual/app", port: 5173 }`.
5. `tests/visual/draw-frame.spec.ts` navigates to the test page, waits for `window.fontsReady`, calls `page.evaluate(fixture => window.render(fixture), fixtureJson)` for each fixture, and compares the canvas screenshot to the golden PNG in `__snapshots__/`. One fixture uses Noto Sans Tamil (OFL) to verify that Tamil akshara grapheme clusters are rendered as single indivisible units. The font is committed to `tests/visual/fonts/noto-sans-tamil/`.

Constraints:
- Tests run Chromium only (`projects: [{ name: "chromium" }]`).
- `maxDiffPixelRatio: 0.001`.
- On golden mismatch, Playwright writes a diff PNG; the test failure message includes the path.
- `computeFrameState` and `renderFrame` are NOT called in the Playwright test body.

### Schema staleness test

`scripts/generate-schemas.ts` is re-invoked in memory (imported as a module) during the test suite; its output is deep-compared to the committed JSON files in `packages/engine/schema/`. Any divergence fails the test.

### ESLint enforcement

`packages/engine/eslint.config.js`:

```javascript
// packages/engine/eslint.config.js
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math",        property: "random",  message: "Use createPRNG() instead." },
        { object: "Date",        property: "now",     message: "Not allowed in engine/src." },
        { object: "performance", property: "now",     message: "Not allowed in engine/src." },
      ],
    },
  }
);
```

A Kiro `PostFileSave` hook is configured for `packages/engine/src/**` files. When any such file is saved, the hook runs `pnpm --filter ./packages/engine lint --max-warnings 0` and reports failures. The hook is a reporting hook; it does not block the save.

### `docs/dependencies.md` entries

The following entries are added for `packages/engine` dependencies:

| Package | Version | License | Reason |
|---|---|---|---|
| `zod` | (recorded when installed) | MIT | Runtime schema validation and JSON Schema generation via `z.toJSONSchema()` |
| `ajv` | (recorded when installed) | MIT | Dev: validates generated JSON Schema files against a corpus of valid documents in tests |
| `fast-check` | (recorded when installed) | MIT | Dev: property-based testing — generates arbitrary valid and invalid inputs |
| `vitest` | (recorded when installed) | MIT | Dev: test runner for unit and property-based tests (Node, no DOM) |
| `@playwright/test` | (recorded when installed) | Apache-2.0 | Dev: Chromium golden-image tests for `drawFrame` visual regressions |
| `eslint` | (recorded when installed) | MIT | Dev: static analysis; `no-restricted-properties` rule enforces purity in `engine/src` |
| `typescript-eslint` | (recorded when installed) | MIT | Dev: TypeScript-aware ESLint plugin and parser for flat config |
| `typescript` | (recorded when installed) | Apache-2.0 | Dev: strict TypeScript compilation |
| `vite` | (recorded when installed) | MIT | Dev: Vite dev server for Playwright visual test page |

> **Version fields are filled in when `pnpm add` is run. Do not guess or hard-code major version ranges here.**

The `zod-to-json-schema` package is explicitly NOT used; JSON Schema is generated via Zod v4's native `z.toJSONSchema()`.

---

## Appendix: Key Design Decisions

### Why `computeFrameState` / `drawFrame` split?

Separating pure computation from painting means:
- All business logic (keyframe interpolation, easing, effect application, PRNG, text segmentation) is testable in Node without a browser.
- `drawFrame` is a trivially thin function that only needs to be tested visually (golden images).
- Exporters can call `computeFrameState` headlessly and never instantiate a canvas.

### Why `TextMetricsProvider` injection?

`CanvasRenderingContext2D.measureText` is not available in Node. Injecting the provider as part of `ComputeOpts` keeps `computeFrameState` pure and allows `FakeMetricsProvider` (a fixed-advance approximation) to be used in all fast-check tests without spinning up a browser.

### Why `MigrationMap` as an optional parameter?

Passing a `MigrationMap` to `migrateProject` lets tests exercise multi-step migration chains against synthetic schema versions without touching production migration code. Production callers omit this parameter and get the built-in migration steps.

### Why are Playwright fixtures pre-computed?

Pre-computing and committing `FrameState` JSON fixtures decouples the visual test from `computeFrameState`. If a regression is introduced in the computation layer, unit and PBT tests catch it; the golden image test focuses exclusively on `drawFrame` (the painter). This also eliminates non-determinism that could arise from font loading timing differences between fixture generation and test runs.

### Why mulberry32 with `Math.imul`?

Mulberry32 is a small, fast, well-understood PRNG with good statistical properties for this use case. `Math.imul` provides 32-bit integer multiplication that is identical across JS engines and platforms, making the PRNG truly cross-platform deterministic without relying on typed arrays for overflow semantics.

### Why FNV-1a for the PRNG seed derivation?

32-bit FNV-1a is a simple, fast, and well-known non-cryptographic hash that produces consistent results across platforms. It is applied over `JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex])` to derive a per-segment seed. Using `JSON.stringify` of an array eliminates ambiguity when `layerId` values contain special characters such as colons or brackets.

### Why grapheme clusters via Intl.Segmenter?

Tamil, Devanagari, and emoji sequences involve multi-codepoint characters that must not be split mid-cluster. `Intl.Segmenter` with `granularity: "grapheme"` handles this correctly across all supported scripts. Splitting on codepoints or code units would break rendering for these languages and produce incorrect `charIndex` sequencing.
