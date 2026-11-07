# Requirements Document

## Introduction

The effect-presets feature adds ten new built-in effects to the `packages/engine` package and a machine-readable preset catalog that the studio UI consumes to list effects without hardcoding. Each new effect follows the exact structure and contract of the existing `typewriter` and `fade-slide` reference effects: a kebab-case directory under `packages/engine/src/effects/`, a `schema.ts` holding a Zod params schema, an `index.ts` exporting a pure `applyEffect` and a side-effect-free `register(registry)`, and co-located `*.test.ts` files with unit and property-based coverage. The ten new effects are `blur-in`, `glitch-reveal`, `kinetic-pop`, `letter-spread`, `line-wipe`, `neon-flicker`, `rotate-drop`, `scale-bounce`, `spotlight`, and `wave`.

This feature makes exactly one change to existing engine rendering code — pivoting each segment's `scale` and `rotation` about an approximate glyph-center pivot (the horizontal center of the advance width at roughly the vertical center of capital letters) in `drawFrame` (Requirement 17) — and otherwise does not change engine types, `FrameState`, `computeFrameState`, the registry, or the existing project/keyframe/effect schemas, and keeps all existing golden images pixel-identical. Every new effect expresses its visual result using only the existing `SegmentOverrides` fields, stays within the numeric ranges the `drawFrame` hardening accepts, and is pure and deterministic — any randomness flows exclusively through the per-segment `PRNG` passed in `ApplyEffectArgs.prng`. No new third-party dependencies and no `tsconfig` changes are introduced.

The preset catalog is a new exported data structure that enumerates all twelve built-in effects (the ten new effects plus `typewriter` and `fade-slide`) with the metadata the UI needs, and a test keeps the catalog and the effect registry from drifting apart.

## Glossary

- **Engine**: The `packages/engine` package — the sole home of Zod schemas, the effect registry, built-in effects, and `renderFrame`. Has zero runtime dependencies on `exporters`, `embed`, or `studio`.
- **EffectDefinition**: The runtime record registered in the EffectRegistry — `id` (kebab-case string), `displayName` (string), `paramSchema` (Zod schema), and `applyEffect(args: ApplyEffectArgs): SegmentOverrides`.
- **EffectRegistry**: An in-memory registry created by `createRegistry()` that maps effect ids to `EffectDefinition` objects via `register` / `get`.
- **registerBuiltinEffects**: The Engine function that installs every effect bundled with the engine into a caller-supplied registry. Adding a new built-in effect requires updating only this function.
- **builtinRegistry**: The default registry instance pre-populated by `registerBuiltinEffects` at module load in `packages/engine/src/effects/index.ts`.
- **ApplyEffectArgs**: The per-segment context passed to `applyEffect`: `groupText` (string), `charIndex`, `wordIndex`, `lineIndex` (0-based indices into the layer), `groupIndex` (0-based index within the effect's granularity group), `groupCount` (total number of groups of the effect's granularity), `t` (layer-local time in seconds, always >= 0), `params` (a `Record<string, unknown>` validated against the effect's `paramSchema`), and `prng` (the per-segment `PRNG`).
- **SegmentOverrides**: The partial record of property overrides returned by `applyEffect`. The only fields an effect may set are: `opacity` (unitless in `[0, 1]`), `positionOffset` (`[x, y]` additive offset in px), `scale` (unitless multiplier), `rotation` (degrees), `blur` (px), and `color` (`#rrggbb` hex string). No new fields are added by this feature.
- **PRNG**: The deterministic pseudo-random number source passed as `ApplyEffectArgs.prng`, exposing `next(): number` returning a value in `[0, 1)`. It is the ONLY source of randomness permitted inside an effect.
- **Granularity**: The per-effect-instance setting `character` | `word` | `line` that determines what a "group" is. For `character` granularity each grapheme cluster is a group; for `word` each word is a group; for `line` each line is a group. `groupIndex` and `groupCount` are expressed relative to the effect's chosen granularity.
- **Progress (p)**: A per-group normalized animation position in `[0, 1]`, typically computed as `p = clamp((t - groupIndex * delayPerGroup - startDelay) / durationSeconds, 0, 1)`. `p = 0` is the start of the group's animation; `p = 1` is completion.
- **Identity state**: The terminal `SegmentOverrides` of a non-looping effect once its animation is complete: `opacity` exactly `1`, `positionOffset` exactly `[0, 0]`, `scale` exactly `1`, `rotation` exactly `0`, `blur` exactly `0`, and no `color` override (the segment keeps its layer/keyframe color). An effect that only animates a subset of properties omits the unaffected fields rather than setting them to their identity value.
- **Looping effect**: An effect whose animation repeats on a fixed period and never settles into a terminal identity state. `wave` and `neon-flicker` are looping effects; all other new effects are non-looping.
- **Loop period**: For a looping effect, the duration in seconds after which the effect's output repeats, defined explicitly by the effect's params.
- **InvalidEffectParamsError**: The typed error thrown by an effect's `applyEffect` when its `params` fail `paramSchema.safeParse`, constructed with a message, the effect id, and the Zod error.
- **PresetCatalog**: A machine-readable array exported from the Engine describing every built-in effect for UI consumption. Each entry is a **PresetCatalogEntry**.
- **PresetCatalogEntry**: A catalog record with: `id` (kebab-case string matching a registered effect id and its directory name), `displayName` (string matching the registered `EffectDefinition.displayName`), `description` (a one-line human-readable string), `supportedGranularities` (a non-empty array drawn from `character` | `word` | `line`), `defaultParams` (a params object that passes the effect's `paramSchema`), and `loop` (a boolean, `true` only for looping effects).
- **drawFrame hardening ranges**: The ranges `drawFrame` clamps resolved values to: `blur` in `[0, 1000]`, `scale` in `[0, 100]`, `opacity` in `[0, 1]`, `rotation` conceptually within `[-36000, 36000]`, and `positionOffset` per axis within `[-32000, 32000]`. Every effect's output must already lie within these ranges.

## Requirements

### Requirement 1: Shared Effect Contract and Hard Constraints

**User Story:** As an effect author, I want every new preset effect to obey the same purity, determinism, validation, and output-range contract, so that all effects are interchangeable, testable, and safe to compose through `computeFrameState`.

#### Acceptance Criteria

1. THE Engine SHALL place each new effect in `packages/engine/src/effects/<kebab-id>/` containing at least `index.ts` (effect implementation), `schema.ts` (Zod params schema), and one or more co-located `*.test.ts` files, where `<kebab-id>` is byte-for-byte string-equal to the effect's registered `id`.
2. THE Engine SHALL export from each effect's `index.ts` a `register(registry: EffectRegistry): void` function that registers the effect only when invoked by a caller, and SHALL NOT invoke `register` as a side effect of importing the module.
3. THE Engine SHALL implement each effect's `applyEffect(args: ApplyEffectArgs): SegmentOverrides` as a pure function that derives its result solely from `args`, with no access to `Math.random`, `Date.now`, `performance.now`, the DOM, or the network.
4. WHERE an effect requires randomness, THE Engine SHALL obtain that randomness exclusively from `args.prng.next()`.
5. WHEN `applyEffect` is called twice with structurally-equal `args` (including a `prng` seeded identically and advanced identically), THE Engine SHALL return two `SegmentOverrides` values that are structurally equal by value across all present fields, independent of object identity or field insertion order.
6. THE Engine SHALL restrict each effect's returned `SegmentOverrides` to the fields `opacity`, `positionOffset`, `scale`, `rotation`, `blur`, and `color`, and SHALL NOT introduce any new `SegmentOverrides` field, change engine types, `FrameState`, `computeFrameState`, the registry, or the existing project/keyframe/effect schemas, and SHALL NOT change `drawFrame` EXCEPT for the single segment-pivot change specified in Requirement 17.
7. WHEN `applyEffect` returns a `SegmentOverrides`, THE Engine SHALL ensure every present numeric field is finite and within the drawFrame hardening ranges by clamping any computed value to the nearest bound of its range before returning: `opacity` in `[0, 1]`, `blur` in `[0, 1000]`, `scale` in `[0, 100]`, `rotation` in `[-36000, 36000]`, and each axis of `positionOffset` in `[-32000, 32000]`.
8. WHERE an effect sets a non-empty `color` override, THE Engine SHALL produce a string matching `^#[0-9a-fA-F]{6}$`, and SHALL omit the `color` field entirely rather than return an empty, whitespace-only, or otherwise non-matching string.
9. IF `applyEffect` is called with `params` for which `paramSchema.safeParse` returns `success: false`, THEN THE Engine SHALL throw an `InvalidEffectParamsError` constructed with a message, the effect's `id`, and the Zod error from that `safeParse` result, and SHALL leave the input `args` unmodified.
10. THE Engine SHALL define each effect's numeric params in its Zod `paramSchema` with `.finite()` on every number and both a hard minimum and a hard maximum bound on every numeric param, with defaults supplied where a sensible default exists.
11. WHEN an EffectRegistry is built with every new effect registered, THE Engine SHALL register each effect's `id` without a `DuplicateEffectError` and SHALL make each effect resolvable via `registry.get(id)`.
12. THE Engine SHALL add no new third-party dependency and SHALL make no `tsconfig` change to implement this feature.

### Requirement 2: Granularity, Stagger, and Terminal State

**User Story:** As a user applying an effect at a chosen granularity, I want each effect to stagger and complete predictably based on `groupIndex` and `groupCount`, so that the animation reads correctly whether applied per character, per word, or per line.

#### Acceptance Criteria

1. THE Engine SHALL document, for each new effect, which granularities (`character`, `word`, `line`) it supports in both that effect's catalog entry `supportedGranularities` (a non-empty subset of {`character`, `word`, `line`}) and the effect-pack documentation.
2. WHEN an effect uses a per-group stagger with a stagger param greater than `0`, THE Engine SHALL derive each group's animation start time from `args.groupIndex` and the effect's stagger param such that the group with `groupIndex = 0` has the earliest start time and, for any two groups, a strictly larger `groupIndex` yields a start time greater than or equal to that of a smaller `groupIndex`, using `args.groupCount` only where the effect's definition requires the total count.
3. WHEN the effect's stagger param is `0`, THE Engine SHALL assign every group the same animation start time regardless of `args.groupIndex`.
4. WHEN `args.groupCount` is `1` (a single group), THE Engine SHALL, for every value of `args.t`, return a `SegmentOverrides` without throwing in which every numeric field present is finite (not `NaN`, `Infinity`, or `-Infinity`).
5. WHEN a non-looping effect's per-group progress `p` reaches `1` (animation complete for that group), THE Engine SHALL return the identity state for that group: `opacity` exactly `1` where the effect animates opacity, `positionOffset` exactly `[0, 0]` where the effect animates position, `scale` exactly `1` where the effect animates scale, `rotation` exactly `0` where the effect animates rotation, `blur` exactly `0` where the effect animates blur, and no `color` override.
6. WHEN a non-looping effect's per-group progress `p` is `0` (animation not yet started for that group), THE Engine SHALL return that effect's defined start state as specified in the effect's own requirement.
7. WHILE a non-looping effect's per-group progress `p` is strictly between `0` and `1`, THE Engine SHALL return values within the drawFrame hardening ranges — `opacity` in `[0, 1]`, `scale` in `[0, 100]`, `blur` in `[0, 1000]`, and any `color` override matching the `#rrggbb` hex format — that change monotonically with increasing `p` from the start state toward the identity state, except where the effect's own requirement defines a different non-monotonic trajectory.
8. THE Engine SHALL define each looping effect's loop period explicitly from its params, and looping effects (`wave`, `neon-flicker`) are exempt from the terminal-identity requirement in criterion 5.
9. THE Engine SHALL define that a group whose staggered animation start time (derived from `args.groupIndex`, the effect's stagger param, and `startDelay`) falls at or after the layer's active end never reaches progress `p = 1` within the layer's lifetime and therefore never completes its animation; authors SHALL choose `delayPerGroup`, `startDelay`, `durationSeconds`, and the layer's duration together so that every group that should complete does so before the layer ends.

### Requirement 3: Blur-In Effect

**User Story:** As a user, I want a built-in `blur-in` effect that brings each group into focus from a blurred, transparent start, so that text resolves into sharpness as it appears.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `blur-in` at `packages/engine/src/effects/blur-in/`, supporting `character`, `word`, and `line` granularities.
2. THE `blur-in` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.6`), `startBlur` (finite px, min `0`, max `1000`, default `12`), `delayPerGroup` (finite seconds, min `0`, max `60`, default `0.05`), and `easing` (an `EasingSchema` value).
3. IF `applyEffect` is called with `params` that fail `paramSchema` validation (a missing field, an out-of-range value, or a non-finite number), THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `blur-in` and SHALL return no segment overrides.
4. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay - args.groupIndex * args.params.delayPerGroup) / args.params.durationSeconds, 0, 1)`, then an eased value `e` obtained by evaluating `args.params.easing` over the range `[0, 1]` at `p` (so `e` lies in `[0, 1]`, equals `0` when `p` is `0`, and equals `1` when `p` is `1`), and SHALL return `opacity = e` and `blur = args.params.startBlur * (1 - e)` as the only animated override fields, leaving all other `SegmentOverrides` fields unchanged.
5. WHEN `p` is `0`, THE Engine SHALL return `opacity` exactly `0` and `blur` exactly `args.params.startBlur`.
6. WHEN `p` is `1`, THE Engine SHALL return `opacity` exactly `1` and `blur` exactly `0`.

### Requirement 4: Glitch-Reveal Effect

**User Story:** As a user, I want a built-in `glitch-reveal` effect that reveals each group with a brief jittered, flickering distortion driven by the seeded PRNG, so that text arrives with a digital-glitch character that is identical on every render.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `glitch-reveal` at `packages/engine/src/effects/glitch-reveal/`, supporting `character`, `word`, and `line` granularities.
2. THE `glitch-reveal` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.5`), `delayPerGroup` (finite seconds, min `0`, max `60`, default `0.04`), `maxOffset` (finite px, min `0`, max `2000`, default `18`), `steps` (integer, min `1`, max `30`, default `8`), and `easing` (an `EasingSchema` value).
3. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `glitch-reveal` and SHALL return no segment overrides.
4. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay - args.groupIndex * args.params.delayPerGroup) / args.params.durationSeconds, 0, 1)`, an eased value `e` in `[0, 1]` from `p` via `args.params.easing`, the jitter magnitude `magnitude = args.params.maxOffset * (1 - e)`, and the integer step index `k = min(steps - 1, floor(p * steps))` so that `k` is in `[0, steps - 1]` and advances through `steps` discrete values as `p` goes from `0` to `1`.
5. WHEN the jitter magnitude is greater than `0`, THE Engine SHALL draw exactly `k + 1` values from `args.prng.next()` in order and use ONLY the last two of those draws (call them `rx` and `ry`) to compute `positionOffset = [(rx * 2 - 1) * magnitude, (ry * 2 - 1) * magnitude]`, so each axis stays within `[-args.params.maxOffset, args.params.maxOffset]`. (When `k + 1` is `1`, the single draw is reused for both axes.)
6. WHEN the jitter magnitude is `0`, THE Engine SHALL return `positionOffset` exactly `[0, 0]` and SHALL draw zero values from `args.prng`.
7. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL return `opacity = e` in `[0, 1]`.
8. WHEN called twice with the same `(seed-derived prng, args.t, args.groupIndex, params)`, THE Engine SHALL return structurally-equal `SegmentOverrides` (determinism), since the step index and the drawn values are fully determined by those inputs.
9. THE Engine SHALL produce, for at least some `args.t` values within the animation, different `positionOffset` values at different step indices `k` (the jitter visibly changes across steps rather than being constant for the whole reveal).
10. WHEN `p` is `1`, THE Engine SHALL return `opacity` exactly `1` and `positionOffset` exactly `[0, 0]` (identity state for the animated properties).

### Requirement 5: Kinetic-Pop Effect

**User Story:** As a user, I want a built-in `kinetic-pop` effect that pops each group in by overshooting its scale before settling, so that text enters with energetic emphasis.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `kinetic-pop` at `packages/engine/src/effects/kinetic-pop/`, supporting `character`, `word`, and `line` granularities.
2. THE `kinetic-pop` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.45`), `delayPerGroup` (finite seconds, min `0`, max `60`, default `0.05`), `startScale` (finite multiplier, min `0`, max `100`, default `0.2`), `overshoot` (finite multiplier added at the peak, min `0`, max `10`, default `0.25`), and `easing` (an `EasingSchema` value).
3. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `kinetic-pop` and SHALL return no segment overrides.
4. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay - args.groupIndex * args.params.delayPerGroup) / args.params.durationSeconds, 0, 1)` and an eased value `e` in `[0, 1]` derived from `p` via `args.params.easing`.
5. WHEN `applyEffect` is called with valid `params` whose `easing` attains an eased value of `0.6` for some `p` (every continuous easing — `linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier` — does so), THE Engine SHALL return `opacity = e` and a `scale` whose maximum over `p` in `[0, 1]` equals `target = max(args.params.startScale, 1 + args.params.overshoot)`, attained at the `p` whose eased value `e` equals `0.6` (which lies in the open interval `(0.25, 0.75)`); the `scale` curve SHALL be monotone non-decreasing for `e` in `[0, 0.6]` when `args.params.startScale <= target` and monotone non-increasing for `e` in `[0.6, 1]`, SHALL equal `args.params.startScale` at `p = 0`, and SHALL equal exactly `1` at `p = 1`, with `scale` clamped to `[0, 100]` on return. WHERE the `easing` is a `step` easing whose eased value may jump past `0.6` without attaining it, the peak need not equal `target`; in that case THE Engine SHALL keep `scale` within `[min(args.params.startScale, 1), target]` for all `p` and SHALL still return exactly `1` at `p = 1`. This is a wording clarification of the peak condition's domain; the formula and the `[0, 100]` bound are unchanged.
6. WHEN `p` is `0`, THE Engine SHALL return `opacity` exactly `0` and `scale` exactly `args.params.startScale`.
7. WHEN `p` is `1`, THE Engine SHALL return `opacity` exactly `1` and `scale` exactly `1` (identity state for the animated properties).

### Requirement 6: Letter-Spread Effect

**User Story:** As a user, I want a built-in `letter-spread` effect that opens each group outward from a collapsed position into its final layout, so that text appears to spread apart as it settles.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `letter-spread` at `packages/engine/src/effects/letter-spread/`, supporting `character`, `word`, and `line` granularities, and SHALL read most strongly as letter spacing at `character` granularity.
2. THE Engine SHALL approximate letter spacing — which `SegmentOverrides` cannot express directly — by applying a per-group additive `positionOffset` along a single axis, where the offset magnitude scales with `args.groupIndex` relative to the group center `(args.groupCount - 1) / 2`, and SHALL state this approximation explicitly in the effect-pack documentation.
3. THE `letter-spread` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.5`), `spreadDistance` (finite px of total extra spacing between adjacent groups at the start, min `-2000`, max `2000`, default `24`), `axis` (`x` | `y`, default `x`), and `easing` (an `EasingSchema` value).
4. IF `applyEffect` receives params that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `letter-spread` and SHALL return no segment overrides.
5. WHEN `applyEffect` is called with params that pass `paramSchema` validation, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay) / args.params.durationSeconds, 0, 1)`, an eased value `e` in `[0, 1]` from `p` via `args.params.easing`, and a per-group offset magnitude `m = (args.groupIndex - (args.groupCount - 1) / 2) * args.params.spreadDistance * (1 - e)`, and SHALL return `positionOffset = [m, 0]` when `axis` is `x` or `[0, m]` when `axis` is `y`, with each axis value clamped to the inclusive range `[-32000, 32000]`.
6. WHEN `applyEffect` is called with `args.groupCount` less than or equal to `1`, THE Engine SHALL return `positionOffset` exactly `[0, 0]` (the group center equals the sole `groupIndex`, yielding zero offset).
7. WHEN `p` is `0`, THE Engine SHALL return the fully-spread offset `m = (args.groupIndex - (args.groupCount - 1) / 2) * args.params.spreadDistance`, with each axis value clamped to the inclusive range `[-32000, 32000]`.
8. WHEN `p` is `1`, THE Engine SHALL return `positionOffset` exactly `[0, 0]` (identity state for the animated property).

### Requirement 7: Line-Wipe Effect

**User Story:** As a user, I want a built-in `line-wipe` effect that sweeps a reveal across the groups in order, so that text appears to be wiped into view.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `line-wipe` at `packages/engine/src/effects/line-wipe/`, supporting `character`, `word`, and `line` granularities.
2. THE Engine SHALL approximate a continuous clip wipe — which `SegmentOverrides` cannot express — with a per-group opacity threshold sweep plus a short per-group fade, and SHALL state this approximation explicitly in the effect-pack documentation.
3. THE `line-wipe` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `delayPerGroup` (finite seconds controlling sweep speed, min `0`, max `60`, default `0.05`), `fadeSeconds` (finite seconds for the per-group fade, min `0`, max `60`, default `0.12`), `direction` (`forward` | `backward`, default `forward`), and `easing` (an `EasingSchema` value).
4. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `line-wipe` and SHALL return no segment overrides.
5. WHEN `direction` is `forward`, THE Engine SHALL set each group's reveal threshold to `args.params.startDelay + args.groupIndex * args.params.delayPerGroup`; WHEN `direction` is `backward`, THE Engine SHALL set it to `args.params.startDelay + (args.groupCount - 1 - args.groupIndex) * args.params.delayPerGroup`.
6. WHEN `args.params.fadeSeconds` is `0`, THE Engine SHALL return `opacity` exactly `1` when `args.t >= threshold` and `opacity` exactly `0` otherwise; WHEN `args.params.fadeSeconds` is greater than `0`, THE Engine SHALL compute the fade fraction `q = clamp((args.t - threshold) / args.params.fadeSeconds, 0, 1)` and return `opacity` equal to the eased value of `q` over `[0, 1]` via `args.params.easing`, clamped to `[0, 1]`.
7. WHEN `args.t` is at or beyond `threshold + args.params.fadeSeconds`, THE Engine SHALL return `opacity` exactly `1` (identity state for the animated property).

### Requirement 8: Neon-Flicker Effect

**User Story:** As a user, I want a built-in looping `neon-flicker` effect that makes each group flicker in brightness like a neon sign, so that titles pulse with a retro glow.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `neon-flicker` at `packages/engine/src/effects/neon-flicker/`, supporting `character`, `word`, and `line` granularities, and SHALL mark it as a looping effect (`loop = true`).
2. THE `neon-flicker` effect's `paramSchema` SHALL validate `periodSeconds` (finite loop period, min `0.05`, max `60`, default `1.2`), `minOpacity` (finite, min `0`, max `1`, default `0.4`), `cellsPerPeriod` (integer, min `1`, max `64`, default `16`), and `phasePerGroup` (finite seconds of per-group phase offset, min `0`, max `60`, default `0.07`).
3. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `neon-flicker` and SHALL return no segment overrides.
4. THE Engine SHALL define the loop period as `args.params.periodSeconds` and SHALL compute the loop phase `phase = ((args.t - args.groupIndex * args.params.phasePerGroup) mod periodSeconds + periodSeconds) mod periodSeconds`, which lies in the half-open range `[0, periodSeconds)` and stays finite for every `args.t`.
5. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute the integer cell index `k = min(cellsPerPeriod - 1, floor((phase / periodSeconds) * cellsPerPeriod))` so that `k` is in `[0, cellsPerPeriod - 1]`, SHALL draw exactly `k + 1` values from `args.prng.next()` in order, and SHALL use the LAST drawn value `r` (in `[0, 1)`) to compute `opacity = args.params.minOpacity + (1 - args.params.minOpacity) * r`, clamped to `[0, 1]` and therefore in the closed interval `[args.params.minOpacity, 1]`.
6. THE Engine SHALL ensure the output repeats exactly every loop period: for every `args.t`, the returned `opacity` at `args.t` equals the returned `opacity` at `args.t + args.params.periodSeconds`, because `phase`, `k`, and the drawn values depend only on `phase`.
7. WHEN called twice with the same `(seed-derived prng, args.t, args.groupIndex, params)`, THE Engine SHALL return structurally-equal opacity values (determinism), and the effect is exempt from the terminal-identity requirement because `loop = true`.
8. THE Engine SHALL produce, across the cells of a single period, different `opacity` values for at least some `cellsPerPeriod` settings and seeds (the brightness flickers between cells rather than staying constant for the whole period).

### Requirement 9: Rotate-Drop Effect

**User Story:** As a user, I want a built-in `rotate-drop` effect that drops each group into place from above while rotating to upright, so that text tumbles into position.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `rotate-drop` at `packages/engine/src/effects/rotate-drop/`, supporting `character`, `word`, and `line` granularities.
2. THE `rotate-drop` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.5`), `delayPerGroup` (finite seconds, min `0`, max `60`, default `0.05`), `dropDistance` (finite px, min `-32000`, max `32000`, default `-120`), `startRotation` (finite degrees, min `-36000`, max `36000`, default `-90`), and `easing` (an `EasingSchema` value, default `easeOut`).
3. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay - args.groupIndex * args.params.delayPerGroup) / args.params.durationSeconds, 0, 1)` and an eased value `e = evaluate(args.params.easing, 0, 1, p)` that lies in `[0, 1]`, equals `0` when `p` is `0`, and equals `1` when `p` is `1`.
4. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL return `opacity = e`, `positionOffset = [0, args.params.dropDistance * (1 - e)]` with each axis clamped to `[-32000, 32000]`, and `rotation = args.params.startRotation * (1 - e)` clamped to `[-36000, 36000]`.
5. WHEN `p` is `0`, THE Engine SHALL return `opacity` exactly `0`, `positionOffset` exactly `[0, args.params.dropDistance]`, and `rotation` exactly `args.params.startRotation`.
6. WHEN `p` is `1`, THE Engine SHALL return `opacity` exactly `1`, `positionOffset` exactly `[0, 0]`, and `rotation` exactly `0` (identity state for the animated properties).
7. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `rotate-drop` and SHALL return no segment overrides.

### Requirement 10: Scale-Bounce Effect

**User Story:** As a user, I want a built-in `scale-bounce` effect that bounces each group in with a damped overshoot in scale, so that text lands with a springy settle.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `scale-bounce` at `packages/engine/src/effects/scale-bounce/`, supporting `character`, `word`, and `line` granularities.
2. THE `scale-bounce` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds, min `0.001`, max `60`, default `0.6`), `delayPerGroup` (finite seconds, min `0`, max `60`, default `0.05`), `startScale` (finite multiplier, min `0`, max `100`, default `0`), and `bounces` (finite integer count of damped oscillations, min `0`, max `10`, default `2`).
3. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `p = clamp((args.t - args.params.startDelay - args.groupIndex * args.params.delayPerGroup) / args.params.durationSeconds, 0, 1)` as a finite value in `[0, 1]`.
4. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL compute `scale` as a deterministic closed-form function of `p`, `args.params.startScale`, and `args.params.bounces` alone, using no clock, randomness, or external state, such that the same inputs always yield the same `scale`.
5. WHEN `applyEffect` is called with valid `params` and `args.params.bounces` is greater than or equal to `1`, THE Engine SHALL compute `scale` such that it begins at `args.params.startScale` when `p` is `0`, reaches exactly `1` when `p` is `1`, and exhibits exactly `args.params.bounces` distinct intervals of `p` in `(0, 1)` where `scale` exceeds `1` (each a damped overshoot above `1`), with the successive extremum deviations of `scale` from `1` strictly decreasing (a monotonically decaying envelope), and `scale` clamped to `[0, 100]` on return.
6. WHEN `args.params.bounces` is `0`, THE Engine SHALL compute `scale` that rises from `args.params.startScale` to exactly `1` with no overshoot above `1`.
7. WHEN `applyEffect` is called with valid `params`, THE Engine SHALL return `opacity = clamp(p / epsilon, 0, 1)`, where `epsilon` is a fixed internal constant of `0.05`, so the group becomes fully opaque once `p` reaches `epsilon` and remains visible for the entire bounce.
8. WHEN `p` is `0`, THE Engine SHALL return `scale` exactly `args.params.startScale` and `opacity` exactly `0`.
9. WHEN `p` is `1`, THE Engine SHALL return `opacity` exactly `1` and `scale` exactly `1` (identity state for the animated properties).
10. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `scale-bounce` and SHALL return no segment overrides.

### Requirement 11: Spotlight Effect

**User Story:** As a user, I want a built-in `spotlight` effect that moves a brightened focus across the groups, dimming those outside the focus, so that attention sweeps along the text.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `spotlight` at `packages/engine/src/effects/spotlight/`, supporting `character`, `word`, and `line` granularities.
2. THE Engine SHALL approximate a moving spotlight — which `SegmentOverrides` cannot express as a gradient — by modulating each group's `opacity` based on the distance between the group's index and a moving focus position, and SHALL state this approximation explicitly in the effect-pack documentation.
3. THE `spotlight` effect's `paramSchema` SHALL validate `startDelay` (finite seconds, min `0`, max `60`, default `0`), `durationSeconds` (finite seconds for the focus to travel across all groups, min `0.001`, max `60`, default `1.5`), `radius` (finite number of groups within full brightness, min `0`, max `10000`, default `1`), `dimOpacity` (finite opacity for groups outside the focus, min `0`, max `1`, default `0.15`), and `settleAtEnd` (`true` | `false`, default `true`).
4. IF `applyEffect` is called with `params` that fail `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `spotlight` and SHALL return no segment overrides.
5. WHEN `applyEffect` is called with valid `params` and `args.groupCount` is greater than `1`, THE Engine SHALL compute the normalized sweep `s = clamp((args.t - args.params.startDelay) / args.params.durationSeconds, 0, 1)`, the focus position `f = s * (args.groupCount - 1)`, and the distance `d = abs(args.groupIndex - f)`, and SHALL return `opacity = 1` when `d <= args.params.radius` and otherwise `opacity = clamp(1 - (d - args.params.radius) * (1 - args.params.dimOpacity), args.params.dimOpacity, 1)`, bounded to `[args.params.dimOpacity, 1]`.
6. WHEN `args.groupCount` is `1`, THE Engine SHALL treat the single group as always within the focus and return `opacity` exactly `1`.
7. WHERE `settleAtEnd` is `true`, WHEN `(args.t - args.params.startDelay) / args.params.durationSeconds >= 1`, THE Engine SHALL return `opacity` exactly `1` for every group (terminal identity state).
8. WHERE `settleAtEnd` is `false`, THE Engine SHALL continue to dim groups outside the focus after the sweep completes, and the effect is exempt from the terminal-identity requirement under that setting.

### Requirement 12: Wave Effect

**User Story:** As a user, I want a built-in looping `wave` effect that oscillates each group along an axis with a traveling phase, so that text ripples continuously like a wave.

#### Acceptance Criteria

1. THE Engine SHALL include a built-in effect with id `wave` at `packages/engine/src/effects/wave/`, supporting `character`, `word`, and `line` granularities, and SHALL mark it as a looping effect (`loop = true`).
2. THE `wave` effect's `paramSchema` SHALL validate `periodSeconds` (finite loop period in seconds, min `0.05`, max `60`, default `1.5`), `amplitude` (finite displacement in px, min `0`, max `32000`, default `16`), `axis` (enum of exactly `x` or `y`, default `y`), and `phasePerGroup` (finite radians of phase offset per group, min `-100`, max `100`, default `0.6`).
3. IF `applyEffect` is called with `args.params` that fails `paramSchema` validation, THEN THE Engine SHALL throw a typed `InvalidEffectParamsError` identifying effect id `wave` and SHALL return no segment overrides.
4. THE Engine SHALL define the loop period as `args.params.periodSeconds` and SHALL compute `theta = 2 * Math.PI * (args.t / args.params.periodSeconds) + args.groupIndex * args.params.phasePerGroup`, such that for any `args.t`, the computed `theta` at `args.t` and at `args.t + args.params.periodSeconds` differ by exactly `2 * Math.PI` and therefore yield identical `positionOffset` values (loop repeats every `periodSeconds`).
5. WHEN `applyEffect` is called with valid `args`, THE Engine SHALL compute `m = args.params.amplitude * Math.sin(theta)` and SHALL return `positionOffset = [m, 0]` when `axis` is `x` or `[0, m]` when `axis` is `y`, with each axis value clamped to the inclusive range `[-32000, 32000]`.
6. WHEN `applyEffect` is called twice with `args` whose fields are deeply equal, THE Engine SHALL return two `positionOffset` values that are deeply equal (determinism), and the effect is exempt from the terminal-identity requirement because `loop = true`.

### Requirement 13: Built-In Registration

**User Story:** As an engine consumer, I want all ten new effects registered alongside the existing built-ins, so that `computeFrameState` resolves them through the default registry without extra wiring.

#### Acceptance Criteria

1. THE Engine SHALL register each of the ten new effects into a caller-supplied registry from within `registerBuiltinEffects` in `packages/engine/src/effects/index.ts`, by importing each effect's `register` function and invoking it exactly once per `registerBuiltinEffects` call.
2. THE Engine SHALL pre-populate the exported `builtinRegistry` at module load with all twelve built-in effects (`typewriter`, `fade-slide`, and the ten new effects), such that the registry contains exactly twelve registered effect ids with no duplicates.
3. WHEN `registerBuiltinEffects` is called on a registry returned by a fresh `createRegistry()`, THE Engine SHALL register all twelve built-in effect ids and SHALL complete without throwing a `DuplicateEffectError`.
4. IF `registerBuiltinEffects` is called a second time on a registry that already contains any of the twelve built-in effect ids, THEN THE Engine SHALL throw a `DuplicateEffectError` whose `effectId` equals the first already-registered id encountered, and SHALL leave the registry's existing registrations unchanged.
5. WHEN `registry.get(id)` is called for any of the twelve built-in effect ids, THE Engine SHALL return an `EffectDefinition` whose `id` field equals the requested id.
6. WHEN `registry.get(id)` is called with an id that is not one of the twelve built-in effect ids, THE Engine SHALL return `undefined` without throwing.
7. THE Engine SHALL update `packages/engine/CONTRIBUTING.md` and `docs/effect-pack-format.md` to describe each of the ten new effects and any approximation each effect uses, without adding a new dependency, and SHALL note that for staggered effects a group whose stagger start time falls after the layer's end never animates, so users must choose `delayPerGroup` and layer duration accordingly.

### Requirement 14: Preset Catalog

**User Story:** As a studio UI developer, I want a machine-readable preset catalog exported from the engine, so that I can list and configure effects without hardcoding ids, names, or default params in the UI.

#### Acceptance Criteria

1. THE Engine SHALL export a `presetCatalog` value (an array of `PresetCatalogEntry`) and its `PresetCatalogEntry` type from `packages/engine/src/index.ts`.
2. THE Engine SHALL include exactly one catalog entry per built-in effect, covering all twelve built-in effects (`typewriter`, `fade-slide`, and the ten new effects), with no duplicate `id` values across entries.
3. THE Engine SHALL give each `PresetCatalogEntry` the fields `id` (kebab-case string matching the effect's registered id), `displayName` (a non-empty string of 1 to 60 characters), `description` (a non-empty string of 1 to 120 characters containing no newline characters), `supportedGranularities` (a non-empty array, maximum length 3, of distinct values each drawn from `character` | `word` | `line`), `defaultParams` (an object), and `loop` (a boolean).
4. THE Engine SHALL set `loop` to `true` only for `wave` and `neon-flicker`, and to `false` for every other catalog entry.
5. WHEN a catalog entry's `defaultParams` is parsed with the corresponding effect's `paramSchema`, THE Engine SHALL produce a successful `safeParse` result.

### Requirement 15: Catalog–Registry Drift Guard

**User Story:** As a contributor, I want a test that validates the preset catalog against the effect registry, so that the catalog and the registry cannot drift apart as effects are added or renamed.

#### Acceptance Criteria

1. THE Engine's test suite SHALL include a test that builds a registry via `createRegistry()` with `registerBuiltinEffects`, then asserts that every `presetCatalog` entry `id` resolves to a registered `EffectDefinition`, and IF any `presetCatalog` entry `id` does not resolve to a registered `EffectDefinition`, THEN the test SHALL fail with an assertion message identifying each unresolved catalog `id`; this drift test is the sole enforcement of catalog/registry consistency, caught by the test suite rather than at module load time.
2. THE Engine's test suite SHALL assert that every built-in effect id registered by `registerBuiltinEffects` appears exactly once as a `presetCatalog` entry `id`, such that the count of catalog entries equals the count of registered built-in effects, no registered effect id is absent from the catalog, no catalog `id` is unregistered, and no `id` appears in the catalog more than once.
3. THE Engine's test suite SHALL assert that each `presetCatalog` entry's `displayName` is a string that equals the registered `EffectDefinition.displayName` for the same `id` under exact case-sensitive, codepoint-for-codepoint comparison.
4. THE Engine's test suite SHALL assert that each `presetCatalog` entry's `defaultParams` returns a success result from the registered effect's `paramSchema.safeParse`, and IF `safeParse` returns a failure result for any entry, THEN the test SHALL fail with an assertion message identifying the entry `id`.
5. THE Engine's test suite SHALL assert that each `presetCatalog` entry's `supportedGranularities` is an array containing at least 1 and at most 3 values, where every value is drawn from the set `{ character, word, line }` and no value is repeated.

### Requirement 16: Per-Effect Test Coverage

**User Story:** As a contributor, I want every new effect to carry unit tests for its boundary behavior plus a property-based test for determinism and bounded output, so that each effect's contract is continuously verified.

#### Acceptance Criteria

1. THE Engine SHALL include, for each new effect, co-located `*.test.ts` unit tests asserting the effect's output at `p = 0` (start), at `p = 1` (completion), and at `p = 0.5` (midpoint), each matching that effect's documented start, complete, and intermediate requirements.
2. THE Engine SHALL include, for each new effect, at least one fast-check property-based test over at least 100 generated cases asserting that `applyEffect` returns structurally-equal `SegmentOverrides` whenever it is called twice with structurally-equal `args` (determinism property).
3. THE Engine SHALL include, for each new effect, at least one fast-check property-based test over at least 100 generated cases asserting that for all valid params, all `args.t` in `[0, layer duration]`, and all `args.groupIndex`/`args.groupCount` satisfying `0 <= groupIndex < groupCount`, every present numeric field in the returned `SegmentOverrides` is finite and within the drawFrame hardening ranges (`opacity` in `[0, 1]`, `scale` in `[0, 100]`, `blur` in `[0, 1000]`, `rotation` in `[-36000, 36000]`, each axis of `positionOffset` in `[-32000, 32000]`).
4. THE Engine SHALL add a fast-check arbitrary for each new effect's params to `packages/engine/src/testing/arbitraries.ts`, following the existing arbitraries pattern, generating only params for which that effect's `paramSchema.safeParse` returns a success result.
5. WHERE an effect is non-looping, THE Engine SHALL include a property-based or unit test asserting that at completion (`p = 1`) the returned `SegmentOverrides` is deeply equal, per animated property, to that effect's identity state.
6. IF a test in the new or changed suites is suppressed with `test.skip`, THEN the suppression SHALL include a reference to a tracking issue in the test source; otherwise THE Engine's new and changed test suites SHALL reach a passing state with zero failures before merge.

### Requirement 17: Segment Pivot About Approximate Glyph Center (Single Engine Exception)

**User Story:** As an effect author, I want per-segment `scale` and `rotation` to pivot about the approximate visual center of each segment's glyphs rather than the baseline origin, so that scaling and rotating effects (for example `kinetic-pop`, `scale-bounce`, `rotate-drop`) read as natural emphasis instead of swinging the glyph away from its position.

#### Acceptance Criteria

1. THE Engine SHALL make exactly ONE behavioral change to existing engine rendering code for this feature: in `drawFrame`'s per-segment painter (`packages/engine/src/draw.ts`), it SHALL apply each segment's effect `scale` and `rotation` about an approximate glyph-center pivot instead of about the segment's baseline origin. No other engine type, `FrameState` field, `computeFrameState` behavior, registry, or schema SHALL change.
2. THE Engine SHALL define the pivot, in the segment-local coordinate frame established after translating to `(layoutX + positionOffsetX, layoutY + positionOffsetY)` where the local origin is the glyph BASELINE (because `drawFrame` draws with `ctx.fillText(segment.text, 0, 0)` and `textBaseline = "alphabetic"`), as the point `(px, py)` with `px = segment.width / 2` (the horizontal center of the advance width) and `py = -0.35 * layer.fontSize` (approximately the vertical center of capital letters above the baseline), using the `layer.fontSize` value `drawFrame` already has in scope.
3. WHEN a segment has an effect `scale` and/or `rotation` override, THE Engine SHALL pivot about `(px, py)` by translating by `(+px, +py)`, applying the rotation (degrees to radians) and/or the clamped scale, then translating by `(-px, -py)` before `ctx.fillText`, so `(px, py)` is the fixed point of the scale/rotation transform.
4. WHEN `segment.width` is non-finite, THE Engine SHALL use `px = 0`; WHEN `layer.fontSize` is non-finite, THE Engine SHALL use `py = 0` (each non-finite pivot component degrades to `0` independently).
5. WHEN a segment has NEITHER a finite non-identity `scale` NOR a finite non-zero `rotation` override, THE Engine SHALL emit no pivot translation and SHALL produce canvas calls identical to the current behavior, so segments without scale/rotation (including every segment produced by `typewriter` and `fade-slide`) render pixel-identically and all existing golden images remain unchanged.
6. THE Engine SHALL preserve all existing `drawFrame` hardening when pivoting: `scale` clamped to `[0, 100]`, `rotation` applied only when finite and non-zero, non-finite contributions treated as identity, and every `ctx.save()` matched by a `ctx.restore()` on every control-flow path (balanced save/restore).
7. THE Engine's `drawFrame` tests SHALL include a test asserting that, for a segment rendered with effect `scale = 2`, the pivot point `(segment.width / 2, -0.35 * layer.fontSize)` maps to the same canvas coordinate as it does with no scale override, verified by inspecting the recorded sequence of transform calls (translate/rotate/scale) on a fake/mock context.
8. THE Engine's `drawFrame` tests SHALL include a test asserting that, for a segment rendered with effect `rotation = 90`, the pivot point `(segment.width / 2, -0.35 * layer.fontSize)` maps to the same canvas coordinate as it does with no rotation override, verified by inspecting the recorded sequence of transform calls on a fake/mock context.
9. THE Engine's existing golden-image tests for `typewriter` and `fade-slide` SHALL remain pixel-identical after this change (regression guard confirming the pivot only affects segments that use scale or rotation).
10. THE Engine SHALL correct the inaccurate doc comment in `packages/engine/src/layout.ts` that describes `layoutY` (and the layout origin) as the "top-left" of the glyph box, updating the comment text to state that `drawFrame` consumes the layout position as the glyph baseline origin (`textBaseline = "alphabetic"`); this is a comment-text-only change with NO change to any computed layout value or rendering behavior.
