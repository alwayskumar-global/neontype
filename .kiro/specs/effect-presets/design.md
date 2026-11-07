# Design Document

## Overview

This feature adds ten new pure, deterministic built-in effects to `packages/engine` — `blur-in`, `glitch-reveal`, `kinetic-pop`, `letter-spread`, `line-wipe`, `neon-flicker`, `rotate-drop`, `scale-bounce`, `spotlight`, and `wave` — each following the existing `typewriter`/`fade-slide` contract (kebab-case directory, Zod `schema.ts`, side-effect-free `index.ts` with `applyEffect` + `register`, co-located tests). It also adds a machine-readable `presetCatalog` (twelve entries) exported from the engine so the studio UI lists effects without hardcoding, guarded by a catalog↔registry drift test. The single exception to "no rendering change" is Requirement 17: `drawFrame` pivots each segment's effect `scale`/`rotation` about an approximate glyph center, emitted only when such an override is present so `typewriter`/`fade-slide` golden images stay pixel-identical. No new third-party dependency and no `tsconfig` change.

## Architecture

```
packages/engine/src/
  effects/
    blur-in/       { schema.ts, index.ts, blur-in.test.ts }
    glitch-reveal/ { schema.ts, index.ts, glitch-reveal.test.ts }
    kinetic-pop/   { schema.ts, index.ts, kinetic-pop.test.ts }
    letter-spread/ { schema.ts, index.ts, letter-spread.test.ts }
    line-wipe/     { schema.ts, index.ts, line-wipe.test.ts }
    neon-flicker/  { schema.ts, index.ts, neon-flicker.test.ts }
    rotate-drop/   { schema.ts, index.ts, rotate-drop.test.ts }
    scale-bounce/  { schema.ts, index.ts, scale-bounce.test.ts }
    spotlight/     { schema.ts, index.ts, spotlight.test.ts }
    wave/          { schema.ts, index.ts, wave.test.ts }
    catalog.ts                 # presetCatalog + PresetCatalogEntry/Granularity types
    catalog.test.ts            # Requirement 15 drift guard
    index.ts                   # registerBuiltinEffects wires all 12; builtinRegistry
  draw.ts                      # Requirement 17 segment-pivot change (drawSegment)
  layout.ts                    # Requirement 17.10 doc-comment correction (text only)
  index.ts                     # re-export presetCatalog, PresetCatalogEntry
  testing/arbitraries.ts       # one arbXxxParams per new effect (schema-valid only)
```

- `effects/index.ts` imports each effect's `register` and invokes it once per `registerBuiltinEffects` call (Requirement 13.1); `builtinRegistry` ends up with exactly twelve ids.
- `catalog.ts` is plain data; it MUST NOT throw at module load. The drift test is the sole enforcement of catalog/registry consistency (Requirement 14, 15.1).
- Each effect uses only existing `SegmentOverrides` fields; no engine type, `FrameState`, `computeFrameState`, registry, or schema changes (Requirement 1.6).

## Components and Interfaces

### Common Effect Skeleton

Every effect's `index.ts` follows the `typewriter` pattern exactly: `safeParse` → throw `InvalidEffectParamsError` on failure → compute from `args` only → return a `SegmentOverrides` whose numeric fields are clamped to the hardening ranges before return (Requirement 1.7).

```ts
import { InvalidEffectParamsError } from "../../errors.js";
import type { ApplyEffectArgs, EffectRegistry, SegmentOverrides } from "../../registry.js";
import { evaluate } from "../../easing.js";
import { XxxParamsSchema } from "./schema.js";

const EFFECT_ID = "xxx";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function applyEffect(args: ApplyEffectArgs): SegmentOverrides {
  const parsed = XxxParamsSchema.safeParse(args.params);
  if (!parsed.success) {
    throw new InvalidEffectParamsError("invalid xxx params", EFFECT_ID, parsed.error);
  }
  const params = parsed.data;
  // ... compute overrides from args + params only ...
  return { /* clamped override fields */ };
}

export function register(registry: EffectRegistry): void {
  registry.register({ id: EFFECT_ID, displayName: "Xxx", paramSchema: XxxParamsSchema, applyEffect });
}
```

**Shared progress convention.** Staggered effects compute

```
p = clamp((t - startDelay - groupIndex * delayPerGroup) / durationSeconds, 0, 1)
e = evaluate(easing, 0, 1, p)   // e in [0,1], e(0)=0 exactly, e(1)=1 exactly
```

Because `evaluate(easing, 0, 1, p)` returns exactly `0` at `p=0` and exactly `1` at `p=1` for every variant, deriving animated fields from `e` gives exact start and identity states for free. Clamping all field values before return satisfies the hardening-range contract regardless of param extremes.

**Why `prng` draws are quantized by time.** The per-segment `PRNG` is derived fresh per frame and is NOT time-dependent — calling `next()` once yields the same first value every frame. To make randomness advance over time, time-varying effects quantize `t` (or `p`) into an integer index `k`, draw `k + 1` values, and use the LAST. Equal indices ⇒ identical draws ⇒ determinism (Requirement 1.5); differing indices ⇒ visibly changing jitter/brightness.

### Per-Effect Design

For every effect: all three granularities (`character`, `word`, `line`) are supported; the Zod schema is the source of truth for param names and bounds (listed by name only below). All formulas are in terms of `e`/`p`/`groupIndex`/`groupCount`/`prng`.

#### blur-in

Params: `startDelay`, `durationSeconds`, `startBlur`, `delayPerGroup`, `easing`.

```
opacity = e
blur    = startBlur * (1 - e)
```

`p=0` → `opacity 0`, `blur = startBlur`. `p=1` → `opacity 1`, `blur 0` (identity). In between, both move monotonically toward identity.

#### glitch-reveal

Params: `startDelay`, `durationSeconds`, `delayPerGroup`, `maxOffset`, `steps`, `easing`.

```
k         = min(steps - 1, floor(p * steps))      // in [0, steps-1]
magnitude = maxOffset * (1 - e)
opacity   = e
```

When `magnitude > 0`: draw exactly `k + 1` values from `prng.next()` in order; take the last two as `rx, ry` (when `k + 1 == 1`, reuse the single draw for both axes); then

```
positionOffset = [(rx*2 - 1) * magnitude, (ry*2 - 1) * magnitude]   // each axis in [-maxOffset, maxOffset]
```

When `magnitude == 0`: return `positionOffset [0, 0]` and draw ZERO values. At `p=1`: `e=1` ⇒ `magnitude=0` ⇒ `positionOffset [0,0]`, `opacity 1` (identity). The step quantization is required because the PRNG is stateless per frame (see skeleton); drawing `k+1` and keeping the last makes the jitter change across steps while staying deterministic.

#### kinetic-pop

Params: `startDelay`, `durationSeconds`, `delayPerGroup`, `startScale`, `overshoot`, `easing`.

Piecewise curve with an exact peak. Let `peakAt = 0.6` and `target = max(startScale, 1 + overshoot)`:

```
e = evaluate(easing, 0, 1, p)
if (p == 1) scale = 1                 // return the literal 1 at completion
else if (e <= peakAt):
  u = e / peakAt
  scale = startScale + (target - startScale) * evaluate("easeOut", 0, 1, u)
else:
  v = (e - peakAt) / (1 - peakAt)
  scale = target + (1 - target) * smoothstep(v)     // smoothstep(v) = v*v*(3 - 2*v)
scale   = clamp(scale, 0, 100)
opacity = e
```

**Proof.**
- `e=0` (so `p=0`): `u=0`, `evaluate("easeOut",0,1,0)=0` ⇒ `scale = startScale` (Requirement 5.6).
- `e=peakAt`: first branch at `u=1` gives `evaluate("easeOut",0,1,1)=1` ⇒ `scale = target`; second branch at `v=0` gives `smoothstep(0)=0` ⇒ `scale = target`. The two branches agree at the peak, which is attained exactly at `target = max(startScale, 1+overshoot)` (Requirement 5.5).
- `e=1` (so `p=1`): the explicit `p==1` guard returns the literal `1`; for completeness the second branch at `v=1` gives `smoothstep(1)=1` ⇒ `target + (1-target) = 1` (Requirement 5.7).
- Monotonicity: `evaluate("easeOut", …)` is non-decreasing in `u`, so the first branch is monotone non-decreasing for `e in [0, peakAt]` when `startScale <= target`; `smoothstep` is non-decreasing in `v`, and `(1 - target) <= 0`, so the second branch is monotone non-increasing for `e in [peakAt, 1]`.
- Peak location `peakAt = 0.6` is the eased value, which lies in `(0.25, 0.75)` as required.
- `target >= 1 + overshoot` exactly when `startScale <= 1 + overshoot`; the max equals `target`, so the peak is `1 + overshoot` in the common case, strictly `> 1` when `overshoot > 0`, and equals `1` when `overshoot = 0` and `startScale <= 1` (then `target = 1` and the curve rises monotonically `startScale → 1`). `scale` clamp to `[0,100]` is the final hard guarantee.
- Easing domain: the peak equals `target` only for easings whose eased value **attains** `0.6` — every continuous easing (`linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier`) does. A `step` easing may jump past `0.6` without landing on it, so the curve can skip the apex and never reach `target`; in that case `scale` still stays within `[min(startScale, 1), target]` for all `p` and is exactly `1` at `p = 1` (both branches are bounded by `target` and the `p == 1` guard returns the literal `1`). This is why Property 6's peak-equality is asserted over continuous easings only, with a separate step-easing example for the bounded guarantee.

#### letter-spread

Params: `startDelay`, `durationSeconds`, `spreadDistance`, `axis`, `easing`. Progress omits `delayPerGroup`: `p = clamp((t - startDelay) / durationSeconds, 0, 1)`.

```
m = (groupIndex - (groupCount - 1) / 2) * spreadDistance * (1 - e)
positionOffset = axis === "x" ? [m, 0] : [0, m]   // each axis clamped to [-32000, 32000]
```

`groupCount <= 1` → `[0, 0]` (center equals the sole index). `p=0` → fully spread `m = (groupIndex - (groupCount-1)/2) * spreadDistance`. `p=1` → `[0, 0]` (identity). Approximation: a per-group additive offset standing in for letter spacing, which `SegmentOverrides` cannot express directly (documented in effect-pack format).

#### line-wipe

Params: `startDelay`, `delayPerGroup`, `fadeSeconds`, `direction`, `easing`.

```
threshold = direction === "forward"
          ? startDelay + groupIndex * delayPerGroup
          : startDelay + (groupCount - 1 - groupIndex) * delayPerGroup
```

- `fadeSeconds == 0`: `opacity = t >= threshold ? 1 : 0`.
- `fadeSeconds > 0`: `q = clamp((t - threshold) / fadeSeconds, 0, 1)`, `opacity = evaluate(easing, 0, 1, q)`.

`opacity` is exactly `1` at and after `threshold + fadeSeconds` (identity for the animated property). Approximation: a per-group opacity threshold sweep plus short fade approximates a continuous clip wipe (documented).

#### neon-flicker (looping)

Params: `periodSeconds`, `minOpacity`, `cellsPerPeriod`, `phasePerGroup`.

```
phase = (((t - groupIndex * phasePerGroup) % period) + period) % period   // [0, period)
k     = min(cellsPerPeriod - 1, floor((phase / period) * cellsPerPeriod))  // [0, cellsPerPeriod-1]
```

Draw exactly `k + 1` values from `prng.next()`; take the LAST value `r`:

```
opacity = clamp(minOpacity + (1 - minOpacity) * r, 0, 1)   // in [minOpacity, 1]
```

`phase`, `k`, and the draws depend only on `phase`, so the output repeats every `period` (Requirement 8.6). Looping ⇒ exempt from terminal identity.

#### rotate-drop

Params: `startDelay`, `durationSeconds`, `delayPerGroup`, `dropDistance`, `startRotation`, `easing` (default `easeOut`).

```
opacity        = e
positionOffset = [0, dropDistance * (1 - e)]     // y axis clamped to [-32000, 32000]
rotation       = startRotation * (1 - e)         // clamped to [-36000, 36000]
```

`p=0` → `opacity 0`, `[0, dropDistance]`, `rotation startRotation`. `p=1` → `opacity 1`, `[0, 0]`, `rotation 0` (identity).

#### scale-bounce

Params: `startDelay`, `durationSeconds`, `delayPerGroup`, `startScale`, `bounces`.

Two branches on `bounces` so Requirement 10 criteria 5, 6, 8, 9 all hold.

**`bounces >= 1` — damped cosine:**

```
scale = 1 + (startScale - 1) * (1 - p) * cos(PI * (2 * bounces + 0.5) * p)
```

- `p=0`: `1 + (startScale - 1) * 1 * cos(0) = startScale` (criterion 8).
- `p=1`: return the literal `1` when `p == 1`; the formula also evaluates to `1 + (startScale - 1) * 0 * cos(...) = 1` exactly (criterion 9).
- Envelope `A(p) = |startScale - 1| * (1 - p)` is strictly decreasing on `[0,1]`, so successive extremum deviations from `1` are strictly decreasing (criterion 5).
- The phase `PI * (2*bounces + 0.5) * p` produces exactly `bounces` distinct intervals in `(0,1)` where `scale` exceeds `1` (each a damped overshoot above `1`), matching Requirement 10.5.

**`bounces == 0` — monotonic branch (guarantees "no overshoot above 1"):**

```
scale = evaluate("easeOut", startScale, 1, p)
```

This is monotone between `startScale` and `1`, equals `startScale` at `p=0` and `1` at `p=1`, and never rises above `1` for any `startScale` (criterion 6). The cos-based form cannot guarantee "no overshoot above 1" for `startScale > 1`, which is why `bounces = 0` uses this dedicated branch.

Opacity (both branches): `opacity = clamp(p / 0.05, 0, 1)` (epsilon `0.05`) — exactly `1` for `p >= 0.05` and at `p=1`, exactly `0` at `p=0`. `scale` is clamped to `[0, 100]` on return (the hard guarantee).

#### spotlight

Params: `startDelay`, `durationSeconds`, `radius`, `dimOpacity`, `settleAtEnd`.

```
s = clamp((t - startDelay) / durationSeconds, 0, 1)
```

- `groupCount <= 1` → `opacity 1` (single group always in focus).
- Else: `f = s * (groupCount - 1)`, `d = abs(groupIndex - f)`,
  `opacity = d <= radius ? 1 : clamp(1 - (d - radius) * (1 - dimOpacity), dimOpacity, 1)`.
- `settleAtEnd === true` and `s >= 1` → `opacity 1` for every group (terminal identity).
- `settleAtEnd === false` → keep dimming after the sweep; exempt from terminal identity.

Approximation: distance-based opacity modulation stands in for a true spotlight gradient (documented).

#### wave (looping)

Params: `periodSeconds`, `amplitude`, `axis`, `phasePerGroup`.

```
theta = 2 * PI * (t / period) + groupIndex * phasePerGroup
m     = amplitude * sin(theta)
positionOffset = axis === "x" ? [m, 0] : [0, m]   // each axis clamped to [-32000, 32000]
```

`theta` advances by exactly `2*PI` over one `period`, so the output repeats every `period` (Requirement 12.4). Looping ⇒ exempt from terminal identity.

### Segment Pivot Change (Requirement 17)

Change is confined to `drawSegment` in `draw.ts`. After the existing translate to `(layoutX + ovOffX, layoutY + ovOffY)` — where the local origin is the glyph BASELINE (`ctx.fillText(text, 0, 0)` with `textBaseline = "alphabetic"`) — compute the pivot:

```ts
const px = Number.isFinite(segment.width) ? segment.width / 2 : 0;
const py = Number.isFinite(fontSize) ? -0.35 * fontSize : 0;
```

Emit the pivot wrapping ONLY when a finite non-identity `scale` and/or a finite non-zero `rotation` override is present:

```
translate(+px, +py)
  rotate(rotDeg → rad)        // only when finite and non-zero (existing guard)
  scale(s, s)                 // s clamped to [0, 100], only when != 1 (existing guard)
translate(-px, -py)
fillText(text, 0, 0)
```

When NEITHER a finite non-identity scale NOR a finite non-zero rotation override is present, emit NO pivot translate — the canvas call sequence is byte-identical to today, so `typewriter`/`fade-slide` segments and all existing golden images stay pixel-identical (Requirement 17.5, 17.9). `save`/`restore` remain balanced via the existing `try/finally`. Each non-finite pivot component degrades to `0` independently (17.4).

`fontSize` must be in scope inside `drawSegment`. `drawLayer` already computes `const fontSize = finiteOr(layer.fontSize, 0)`; pass it (or the raw `layer.fontSize`) as a new `drawSegment` parameter so `py` can apply the `Number.isFinite` guard on the raw value.

`layout.ts` doc-comment correction (text only, no behavior change): replace the "top-left of the first character" / "top-left position" wording describing `layoutY` and the layout origin with text stating that `drawFrame` consumes the layout position as the glyph baseline origin (`textBaseline = "alphabetic"`).

## Data Models

### PresetCatalog

New module `packages/engine/src/effects/catalog.ts`:

```ts
export type Granularity = "character" | "word" | "line";

export interface PresetCatalogEntry {
  id: string;
  displayName: string;                      // exactly matches EffectDefinition.displayName
  description: string;                       // 1..120 chars, no newline
  supportedGranularities: Granularity[];     // non-empty, distinct subset of the three
  defaultParams: Record<string, unknown>;    // passes the effect's paramSchema.safeParse
  loop: boolean;                             // true only for wave and neon-flicker
}

export const presetCatalog: readonly PresetCatalogEntry[] = [
  // ... one entry per built-in effect ...
  {
    id: "blur-in",
    displayName: "Blur In",
    description: "Groups resolve from a blurred, transparent start into sharp focus.",
    supportedGranularities: ["character", "word", "line"],
    defaultParams: { startDelay: 0, durationSeconds: 0.6, startBlur: 12, delayPerGroup: 0.05, easing: "easeOut" },
    loop: false,
  },
  // typewriter, fade-slide, and the remaining eight new effects ...
] as const;
```

The array has exactly twelve entries: `typewriter`, `fade-slide`, and the ten new effects. Each entry's `displayName` must match the corresponding `EffectDefinition.displayName` codepoint-for-codepoint. Each `defaultParams` must equal that effect's schema defaults so `paramSchema.safeParse(defaultParams)` succeeds (Requirement 14.5). `loop` is `true` only for `wave` and `neon-flicker`. The module is plain data and MUST NOT throw at module load. Re-export `presetCatalog` and `PresetCatalogEntry` from `src/index.ts`.

## Error Handling

- Param validation: each `applyEffect` calls `ParamsSchema.safeParse(args.params)` and throws `InvalidEffectParamsError(message, effectId, parsed.error)` on failure, leaving `args` unmodified. `computeFrameState` catches this and turns it into an `InvalidEffectParamsWarning` (existing behavior — unchanged).
- Non-finite guards: effects never emit `NaN`/`±Infinity`; `drawFrame` additionally treats non-finite contributions as identity.
- Every numeric output field is clamped to its hardening range before return (`opacity [0,1]`, `scale [0,100]`, `blur [0,1000]`, `rotation [-36000,36000]`, each `positionOffset` axis `[-32000,32000]`), and `color` is omitted unless it matches `^#[0-9a-fA-F]{6}$`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Each new effect's params get a dedicated `arbXxxParams` arbitrary in `testing/arbitraries.ts` (following the existing `arbTypewriterParams`/`arbFadeSlideParams` pattern, generating only schema-valid params). Each property runs minimum 100 fast-check iterations and is tagged **Feature: effect-presets, Property N: ...**.

### Property 1: Per-effect determinism

*For any* valid params, any `groupIndex`/`groupCount` with `0 <= groupIndex < groupCount`, any `t >= 0`, and a fixed seed-derived `prng`, `applyEffect(args)` returns a `SegmentOverrides` structurally equal to a second call with structurally-equal `args`.

**Validates: Requirements 1.5, 4.8, 8.7, 12.6, 16.2**

### Property 2: Per-effect bounded output

*For any* valid params, any `groupIndex`/`groupCount` with `0 <= groupIndex < groupCount`, and any `t` in `[0, layer duration]`, every present numeric field of the result is finite and within the hardening ranges: `opacity [0,1]`, `scale [0,100]`, `blur [0,1000]`, `rotation [-36000,36000]`, each `positionOffset` axis `[-32000,32000]`.

**Validates: Requirements 1.7, 2.4, 2.7, 16.3**

### Property 3: Terminal identity for non-looping effects

*For any* valid params of a non-looping effect (all except `wave`, `neon-flicker`), at `p = 1` the animated fields equal the identity state (`opacity 1`, `positionOffset [0,0]`, `scale 1`, `rotation 0`, `blur 0`, no `color`), per the fields that effect animates.

**Validates: Requirements 2.5, 3.6, 4.10, 5.7, 6.8, 7.7, 9.6, 10.9, 11.7, 16.5**

### Property 4: Loop period repeats

*For any* valid `wave` or `neon-flicker` params and any `t`, the output at `t` equals the output at `t + periodSeconds`.

**Validates: Requirements 8.6, 12.4**

### Property 5: Time-varying randomness advances

*For some* valid `glitch-reveal` (resp. `neon-flicker`) inputs, the `positionOffset` (resp. `opacity`) differs across distinct step (resp. cell) indices, confirming jitter/brightness changes over time rather than staying constant.

**Validates: Requirements 4.9, 8.8**

### Property 6: Kinetic-pop peak

*For any* valid `kinetic-pop` params whose `easing` is continuous (`linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier`) — i.e. an easing whose eased value attains `0.6` — the maximum `scale` over `p in [0,1]` equals `target = max(startScale, 1 + overshoot)`, attained at the sample whose eased value is `0.6`; the max exceeds `1` iff `overshoot > 0` (with `startScale <= 1 + overshoot`); and a unit test at the DEFAULT params (`startScale 0.2`, `overshoot 0.25`, continuous easing) asserts `scale` exceeds `1` at some `p` and the maximum is within `1e-9` of `1.25`. For a `step` easing (whose eased value may skip `0.6`) the peak-equality is NOT asserted; instead a separate example test checks the step-easing guarantee: `scale` stays within `[min(startScale, 1), target]` for all `p` and equals exactly `1` at `p = 1`. Properties 1–3 still cover step easing for determinism, bounded output, and terminal identity.

**Validates: Requirements 5.5**

### Property 7: Scale-bounce envelope, count, and terminal

*For any* valid `scale-bounce` params, `scale` at `p = 1` is exactly `1`; for the `bounces = 0` branch `scale` never exceeds `1`; and a numeric test over `startScale = 0`, `bounces in 1..10` counts the number of `p`-intervals where `scale > 1 + 1e-9` and asserts it equals `bounces`, and asserts the successive extremum deviations of `scale` from `1` are strictly decreasing.

**Validates: Requirements 10.5, 10.6, 10.9**

### Property 8: Catalog–registry drift guard

*For any* registry built via `createRegistry()` + `registerBuiltinEffects`: every `presetCatalog` id resolves to a registered `EffectDefinition`; entry count equals registered-effect count with no duplicate ids; each entry's `displayName` matches the registered definition exactly; each `defaultParams` passes the effect's `paramSchema.safeParse`; each `supportedGranularities` is a non-empty, distinct subset of `{character, word, line}` of length 1..3; `loop` is `true` only for `wave`/`neon-flicker`.

**Validates: Requirements 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4, 15.5**

### Property 9: Pivot fixed point

*For any* segment rendered with a finite non-identity effect `scale` (e.g. `2`) or a finite non-zero `rotation` (e.g. `90`), the pivot point `(width/2, -0.35*fontSize)` maps to the same canvas coordinate as with no scale/rotation override, verified against the recorded sequence of transform calls on a mock context. `typewriter`/`fade-slide` golden images remain unchanged.

**Validates: Requirements 17.3, 17.5, 17.7, 17.8, 17.9**

## Testing Strategy

**Dual approach.** Unit tests cover concrete examples and boundaries; property-based tests (fast-check, min 100 iterations) cover universal properties. PBT applies here because every effect's `applyEffect` is a pure function with clear input/output behavior and a large input space.

- **Unit tests (per effect):** assert output at `p = 0` (start), `p = 1` (completion), and `p = 0.5` (midpoint) against each effect's documented start/complete/intermediate behavior (Requirement 16.1). Add boundary cases: `groupCount = 1`, `delayPerGroup = 0`, `fadeSeconds = 0` (line-wipe), `magnitude = 0` zero-draw (glitch-reveal), `settleAtEnd` both values (spotlight), `overshoot = 0` (kinetic-pop), `bounces = 0` vs `>= 1` (scale-bounce). Also add a kinetic-pop default-params unit test asserting `scale > 1` at some `p` and `max scale` within `1e-9` of `1.25`; and a scale-bounce test asserting the overshoot-interval count equals `bounces` for `bounces in 1..10` at `startScale = 0`.
- **Property tests (per effect):** Properties 1–3 for every effect; Property 4 for the two looping effects; Property 5 for glitch-reveal/neon-flicker; Property 6 for kinetic-pop; Property 7 for scale-bounce. Each `arbXxxParams` generates only schema-valid params (Requirement 16.4).
- **Catalog drift test** (`catalog.test.ts`): Property 8.
- **Draw/pivot tests** (`draw.test.ts`): Property 9 via a mock `CanvasRenderingContext2D` recording `translate`/`rotate`/`scale`; plus the existing Chromium golden-image tests for `typewriter`/`fade-slide` as the pixel-identical regression guard.
- **Registration tests** (`effects/index.test.ts`): twelve ids registered, no `DuplicateEffectError` on a fresh registry, `DuplicateEffectError` on a second `registerBuiltinEffects`, `get(id)` resolves each id, `get(unknown)` returns `undefined` (Requirement 13).

No `test.skip` without a tracking-issue reference; the new/changed suites must pass with zero failures before merge (Requirement 16.6).

## Traceability

| Requirement | Satisfied by |
|---|---|
| 1 Shared contract | Common Effect Skeleton; Error Handling; Properties 1, 2 |
| 2 Granularity / stagger / terminal | Shared progress convention; per-effect sections; Properties 2, 3 |
| 3 blur-in | blur-in section; Properties 1–3 |
| 4 glitch-reveal | glitch-reveal section; Properties 1–3, 5 |
| 5 kinetic-pop | kinetic-pop section + proof; Properties 1–3, 6 |
| 6 letter-spread | letter-spread section; Properties 1–3 |
| 7 line-wipe | line-wipe section; Properties 1–3 |
| 8 neon-flicker | neon-flicker section; Properties 1, 2, 4, 5 |
| 9 rotate-drop | rotate-drop section; Properties 1–3 |
| 10 scale-bounce | scale-bounce section + proof; Properties 1–3, 7 |
| 11 spotlight | spotlight section; Properties 1–3 |
| 12 wave | wave section; Properties 1, 2, 4 |
| 13 Built-in registration | effects/index.ts wiring; registration tests |
| 14 Preset catalog | PresetCatalog section; Property 8 |
| 15 Drift guard | catalog.test.ts; Property 8 |
| 16 Per-effect coverage | Testing Strategy; Properties 1–3 |
| 17 Segment pivot | Segment Pivot Change section; Property 9 |
