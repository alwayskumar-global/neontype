# Implementation Plan: effect-presets

## Overview

This plan converts the `effect-presets` design into an ordered series of coding tasks that extend `packages/engine` with ten new built-in effects, a preset catalog, and the single `drawFrame` segment-pivot change. The pivot change lands first on its own commit because every scaling/rotating effect depends on it reading correctly; shared fast-check arbitraries follow; then the ten effects in three small batches (each effect fully built — schema, impl, unit and property tests — and committed per batch); then registration, catalog, and the drift guard; then docs; then a final workspace-wide check. Each task names the files it touches, cites the requirement clauses it covers, states a concrete completion check, and is committed with a Conventional Commit message at the batch/unit boundary. Every task, including every property-based test, is required. The design uses concrete TypeScript formulas throughout, so no implementation-language selection is needed. No new third-party dependency is added and `tsconfig` is not touched.

---

## Tasks

- [x] 1. Group 1: drawFrame segment-pivot change (Requirement 17)
  - [x] 1.1 Pivot segment scale/rotation about the approximate glyph center in `drawFrame`
    - Modify `packages/engine/src/draw.ts`: pass `fontSize` into `drawSegment` (reuse the `const fontSize = finiteOr(layer.fontSize, 0)` that `drawLayer` already computes, passing the raw `layer.fontSize` so the `Number.isFinite` guard applies to the raw value).
    - Compute the pivot inside `drawSegment` after the existing translate to `(layoutX + ovOffX, layoutY + ovOffY)`: `const px = Number.isFinite(segment.width) ? segment.width / 2 : 0;` and `const py = Number.isFinite(fontSize) ? -0.35 * fontSize : 0;`.
    - Emit `translate(+px, +py)` … rotation/scale … `translate(-px, -py)` ONLY when a finite non-identity `scale` and/or a finite non-zero `rotation` override is present; emit NO pivot translation otherwise so the canvas call sequence stays byte-identical to today.
    - Preserve all existing hardening: `scale` clamped to `[0, 100]` and applied only when `!= 1`; `rotation` applied only when finite and non-zero; non-finite contributions treated as identity; every `ctx.save()` matched by `ctx.restore()` on every control-flow path (the existing `try/finally`).
    - **Covers:** Requirement 17.1, Requirement 17.2, Requirement 17.3, Requirement 17.4, Requirement 17.5, Requirement 17.6
    - **Completion:** `pnpm --filter @studio/engine exec tsc --noEmit` passes; `drawSegment` emits the pivot wrapping only for segments carrying a scale/rotation override.

  - [x] 1.2 Correct the `layout.ts` doc comment for the layout origin
    - Edit `packages/engine/src/layout.ts`: replace the "top-left of the first character" / "top-left position" wording describing `layoutY` and the layout origin with text stating that `drawFrame` consumes the layout position as the glyph baseline origin (`textBaseline = "alphabetic"`). Comment-text only — no computed layout value or rendering behavior changes.
    - **Covers:** Requirement 17.10
    - **Completion:** The `layout.ts` doc comment describes `layoutY` as the glyph baseline origin; `pnpm --filter @studio/engine exec tsc --noEmit` passes.

  - [x] 1.3 Write pivot fixed-point draw tests (Property 9)
    - Add tests to `packages/engine/src/draw.test.ts` using a mock `CanvasRenderingContext2D` that records `translate`/`rotate`/`scale` calls.
    - Tagged `// Feature: effect-presets, Property 9: Pivot fixed point` — assert a segment with effect `scale = 2` keeps the pivot `(width/2, -0.35 * fontSize)` fixed in canvas coordinates versus no override; assert a segment with effect `rotation = 90` keeps the same pivot fixed; assert a segment with NO scale/rotation override produces a transform-call sequence identical to current behavior (the pixel-identical Node-level guard).
    - The existing Chromium golden-image tests for `typewriter`/`fade-slide` remain the pixel-identical regression guard (Requirement 17.9) and must stay unchanged; run them via the Playwright harness where available — the mock-context test is the Node-level guard that runs under Vitest.
    - **Covers:** Requirement 17.5, Requirement 17.7, Requirement 17.8, Requirement 17.9
    - **Completion:** `pnpm vitest run src/draw.test.ts` (from `packages/engine`) passes with zero failures.
    - Commit: `feat(effect-presets): pivot segment scale/rotation about glyph center in drawFrame`

  - [x] 1.4 Checkpoint — Group 1
    - Run `pnpm --filter @studio/engine exec tsc --noEmit`, `pnpm --filter @studio/engine lint`, and `pnpm vitest run src/draw.test.ts` (from `packages/engine`).
    - **Completion:** All three commands exit with code 0 and zero failures.

- [x] 2. Group 2: Shared fast-check arbitraries
  - [x] 2.1 Add schema-valid arbitraries for all ten effect param schemas
    - Add `arbBlurInParams`, `arbGlitchRevealParams`, `arbKineticPopParams`, `arbLetterSpreadParams`, `arbLineWipeParams`, `arbNeonFlickerParams`, `arbRotateDropParams`, `arbScaleBounceParams`, `arbSpotlightParams`, and `arbWaveParams` to `packages/engine/src/testing/arbitraries.ts`, each following the existing `arbTypewriterParams`/`arbFadeSlideParams` pattern.
    - Each arbitrary generates ONLY schema-valid params: every number finite and within that param's documented min/max; `steps` (glitch-reveal), `cellsPerPeriod` (neon-flicker), and `bounces` (scale-bounce) as integers; `easing` via the existing `arbEasing`; enum params (`axis`, `direction`, `settleAtEnd`) drawn from their allowed values.
    - These param schemas do not exist yet (they are authored per-effect in Group 3). The arbitraries encode the same bounds the Group 3 schemas will enforce — note this ordering dependency: each effect's Group 3 property tests import its arbitrary from this file.
    - **Covers:** Requirement 16.4
    - **Completion:** `pnpm --filter @studio/engine exec tsc --noEmit` passes (arbitraries compile; they are exercised by the Group 3 property tests).
    - Commit: `test(effect-presets): add fast-check arbitraries for all ten effect param schemas`

  - [x] 2.2 Checkpoint — Group 2
    - Run `pnpm --filter @studio/engine exec tsc --noEmit` and `pnpm --filter @studio/engine lint`.
    - **Completion:** Both commands exit with code 0 and zero errors.

- [x] 3. Group 3a: blur-in, glitch-reveal, kinetic-pop, letter-spread
  - [x] 3.1 Implement `blur-in` effect with unit and property tests
    - Create `packages/engine/src/effects/blur-in/schema.ts` (`BlurInParamsSchema`: `startDelay`, `durationSeconds`, `startBlur`, `delayPerGroup`, `easing`; `.finite()` on every number, hard min AND max per Requirement 3.2, defaults per design), `packages/engine/src/effects/blur-in/index.ts` (pure `applyEffect` computing `p`, `e`, `opacity = e`, `blur = startBlur * (1 - e)`, clamped on return; `register(registry)`; throws `InvalidEffectParamsError("…", "blur-in", parsed.error)` on `safeParse` failure; no `register` at load time), and `packages/engine/src/effects/blur-in/blur-in.test.ts`.
    - Tests: unit at `p = 0` (`opacity 0`, `blur = startBlur`), `p = 1` (`opacity 1`, `blur 0`), `p = 0.5` (midpoint monotone toward identity); `InvalidEffectParamsError` on bad params. Property tests using `arbBlurInParams`: Property 1 determinism, Property 2 bounded output, Property 3 terminal identity at `p = 1`.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 3.1, Requirement 3.2, Requirement 3.3, Requirement 3.4, Requirement 3.5, Requirement 3.6, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/blur-in` (from `packages/engine`) passes with zero failures.

  - [x] 3.2 Implement `glitch-reveal` effect with unit and property tests
    - Create `packages/engine/src/effects/glitch-reveal/schema.ts` (`startDelay`, `durationSeconds`, `delayPerGroup`, `maxOffset`, `steps` integer, `easing`; `.finite()`, hard min/max per Requirement 4.2, defaults), `index.ts` (compute `p`, `e`, `k = min(steps - 1, floor(p * steps))`, `magnitude = maxOffset * (1 - e)`; when `magnitude > 0` draw exactly `k + 1` PRNG values in order and use the last two `rx`/`ry` — reuse the single draw for both axes when `k + 1 == 1` — for `positionOffset = [(rx*2-1)*magnitude, (ry*2-1)*magnitude]`; when `magnitude == 0` return `[0, 0]` and draw zero values; `opacity = e`; clamp on return; `register`; throws `InvalidEffectParamsError` for `glitch-reveal`), and `glitch-reveal.test.ts`.
    - Tests: unit at `p = 0`, `p = 1` (`opacity 1`, `positionOffset [0,0]`), `p = 0.5`; the `magnitude == 0` zero-draw boundary; `InvalidEffectParamsError` on bad params. Property tests using `arbGlitchRevealParams`: Property 1 determinism, Property 2 bounded (each axis in `[-maxOffset, maxOffset]`), Property 3 terminal identity, Property 5 jitter differs across distinct step indices.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.4, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 4.1, Requirement 4.2, Requirement 4.3, Requirement 4.4, Requirement 4.5, Requirement 4.6, Requirement 4.7, Requirement 4.8, Requirement 4.9, Requirement 4.10, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/glitch-reveal` (from `packages/engine`) passes with zero failures.

  - [x] 3.3 Implement `kinetic-pop` effect with unit and property tests
    - Create `packages/engine/src/effects/kinetic-pop/schema.ts` (`startDelay`, `durationSeconds`, `delayPerGroup`, `startScale`, `overshoot`, `easing`; `.finite()`, hard min/max per Requirement 5.2, defaults), `index.ts` (compute `p`, `e`, `peakAt = 0.6`, `target = max(startScale, 1 + overshoot)`; piecewise `scale` per design — first branch `startScale + (target - startScale) * evaluate("easeOut",0,1,e/peakAt)` for `e <= peakAt`, else `target + (1 - target) * smoothstep(v)`; explicit `scale = 1` at `p == 1`; `opacity = e`; `scale` clamped to `[0,100]`; `register`; throws `InvalidEffectParamsError`), and `kinetic-pop.test.ts`.
    - Tests: unit at `p = 0` (`opacity 0`, `scale = startScale`), `p = 1` (`opacity 1`, `scale 1`), `p = 0.5`; `overshoot = 0` boundary; the DEFAULT-params assertion (`scale > 1` at some `p` and `max scale` within `1e-9` of `1.25`); `InvalidEffectParamsError`. Property tests using `arbKineticPopParams`: Property 1 determinism, Property 2 bounded, Property 3 terminal identity, Property 6 kinetic-pop peak (`max scale == target`, attained where `e == 0.6`, exceeds `1` iff `overshoot > 0`).
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 5.1, Requirement 5.2, Requirement 5.3, Requirement 5.4, Requirement 5.5, Requirement 5.6, Requirement 5.7, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/kinetic-pop` (from `packages/engine`) passes with zero failures.

  - [x] 3.4 Implement `letter-spread` effect with unit and property tests
    - Create `packages/engine/src/effects/letter-spread/schema.ts` (`startDelay`, `durationSeconds`, `spreadDistance`, `axis` `x`|`y`, `easing`; `.finite()`, hard min/max per Requirement 6.3, defaults), `index.ts` (compute `p = clamp((t - startDelay) / durationSeconds, 0, 1)` — no `delayPerGroup`; `e`; `m = (groupIndex - (groupCount - 1)/2) * spreadDistance * (1 - e)`; `positionOffset = axis === "x" ? [m, 0] : [0, m]` clamped per axis to `[-32000, 32000]`; `groupCount <= 1` → `[0, 0]`; `register`; throws `InvalidEffectParamsError`), and `letter-spread.test.ts`.
    - Tests: unit at `p = 0` (fully-spread `m`), `p = 1` (`[0, 0]`), `p = 0.5`; `groupCount = 1` boundary → `[0, 0]`; both axes; `InvalidEffectParamsError`. Property tests using `arbLetterSpreadParams`: Property 1 determinism, Property 2 bounded, Property 3 terminal identity.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 6.1, Requirement 6.2, Requirement 6.3, Requirement 6.4, Requirement 6.5, Requirement 6.6, Requirement 6.7, Requirement 6.8, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/letter-spread` (from `packages/engine`) passes with zero failures.
    - Commit: `feat(effect-presets): add blur-in, glitch-reveal, kinetic-pop, letter-spread effects`

  - [x] 3.5 Checkpoint — Group 3a
    - Run `pnpm --filter @studio/engine exec tsc --noEmit`, `pnpm --filter @studio/engine lint`, and `pnpm vitest run src/effects` (from `packages/engine`).
    - **Completion:** All three commands exit with code 0 and zero failures.

- [x] 4. Group 3b: line-wipe, neon-flicker, rotate-drop
  - [x] 4.1 Implement `line-wipe` effect with unit and property tests
    - Create `packages/engine/src/effects/line-wipe/schema.ts` (`startDelay`, `delayPerGroup`, `fadeSeconds`, `direction` `forward`|`backward`, `easing`; `.finite()`, hard min/max per Requirement 7.3, defaults), `index.ts` (`threshold` from `direction`/`groupIndex`/`groupCount` per design; when `fadeSeconds == 0` `opacity = t >= threshold ? 1 : 0`; when `fadeSeconds > 0` `q = clamp((t - threshold)/fadeSeconds, 0, 1)`, `opacity = evaluate(easing, 0, 1, q)` clamped to `[0,1]`; `register`; throws `InvalidEffectParamsError`), and `line-wipe.test.ts`.
    - Tests: unit at `p = 0`/before threshold, `p = 1`/at or beyond `threshold + fadeSeconds` (`opacity 1`), `p = 0.5` midpoint; `fadeSeconds = 0` hard-step boundary; both directions; `InvalidEffectParamsError`. Property tests using `arbLineWipeParams`: Property 1 determinism, Property 2 bounded, Property 3 terminal identity.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 7.1, Requirement 7.2, Requirement 7.3, Requirement 7.4, Requirement 7.5, Requirement 7.6, Requirement 7.7, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/line-wipe` (from `packages/engine`) passes with zero failures.

  - [x] 4.2 Implement `neon-flicker` effect with unit and property tests
    - Create `packages/engine/src/effects/neon-flicker/schema.ts` (`periodSeconds`, `minOpacity`, `cellsPerPeriod` integer, `phasePerGroup`; `.finite()`, hard min/max per Requirement 8.2, defaults), `index.ts` (`phase = (((t - groupIndex * phasePerGroup) % period) + period) % period`; `k = min(cellsPerPeriod - 1, floor((phase/period) * cellsPerPeriod))`; draw exactly `k + 1` PRNG values, use the LAST `r`; `opacity = clamp(minOpacity + (1 - minOpacity) * r, 0, 1)`; looping — no terminal identity; `register`; throws `InvalidEffectParamsError`), and `neon-flicker.test.ts`.
    - Tests: unit asserting `opacity` lies in `[minOpacity, 1]` at sample times across one period; `InvalidEffectParamsError`. Property tests using `arbNeonFlickerParams`: Property 1 determinism, Property 2 bounded, Property 4 loop-period (`opacity(t) == opacity(t + periodSeconds)`), Property 5 brightness differs across distinct cell indices.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.4, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.8, Requirement 8.1, Requirement 8.2, Requirement 8.3, Requirement 8.4, Requirement 8.5, Requirement 8.6, Requirement 8.7, Requirement 8.8, Requirement 16.1, Requirement 16.2, Requirement 16.3
    - **Completion:** `pnpm vitest run src/effects/neon-flicker` (from `packages/engine`) passes with zero failures.

  - [x] 4.3 Implement `rotate-drop` effect with unit and property tests
    - Create `packages/engine/src/effects/rotate-drop/schema.ts` (`startDelay`, `durationSeconds`, `delayPerGroup`, `dropDistance`, `startRotation`, `easing` default `easeOut`; `.finite()`, hard min/max per Requirement 9.2, defaults), `index.ts` (compute `p`, `e`; `opacity = e`; `positionOffset = [0, dropDistance * (1 - e)]` clamped per axis to `[-32000, 32000]`; `rotation = startRotation * (1 - e)` clamped to `[-36000, 36000]`; `register`; throws `InvalidEffectParamsError`), and `rotate-drop.test.ts`.
    - Tests: unit at `p = 0` (`opacity 0`, `[0, dropDistance]`, `rotation startRotation`), `p = 1` (`opacity 1`, `[0, 0]`, `rotation 0`), `p = 0.5`; `InvalidEffectParamsError`. Property tests using `arbRotateDropParams`: Property 1 determinism, Property 2 bounded, Property 3 terminal identity.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 9.1, Requirement 9.2, Requirement 9.3, Requirement 9.4, Requirement 9.5, Requirement 9.6, Requirement 9.7, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/rotate-drop` (from `packages/engine`) passes with zero failures.
    - Commit: `feat(effect-presets): add line-wipe, neon-flicker, rotate-drop effects`

  - [x] 4.4 Checkpoint — Group 3b
    - Run `pnpm --filter @studio/engine exec tsc --noEmit`, `pnpm --filter @studio/engine lint`, and `pnpm vitest run src/effects` (from `packages/engine`).
    - **Completion:** All three commands exit with code 0 and zero failures.

- [ ] 5. Group 3c: scale-bounce, spotlight, wave
  - [ ] 5.1 Implement `scale-bounce` effect with unit and property tests
    - Create `packages/engine/src/effects/scale-bounce/schema.ts` (`startDelay`, `durationSeconds`, `delayPerGroup`, `startScale`, `bounces` integer; `.finite()`, hard min/max per Requirement 10.2, defaults), `index.ts` (compute `p`; for `bounces >= 1` `scale = 1 + (startScale - 1) * (1 - p) * cos(PI * (2*bounces + 0.5) * p)`; for `bounces == 0` `scale = evaluate("easeOut", startScale, 1, p)`; explicit `scale = 1` at `p == 1`; `opacity = clamp(p / 0.05, 0, 1)`; `scale` clamped to `[0,100]`; `register`; throws `InvalidEffectParamsError`), and `scale-bounce.test.ts`.
    - Tests: unit at `p = 0` (`scale = startScale`, `opacity 0`), `p = 1` (`opacity 1`, `scale 1`), `p = 0.5`; `bounces = 0` monotone no-overshoot branch; the overshoot-interval-count test over `startScale = 0`, `bounces in 1..10` asserting the count of `p`-intervals where `scale > 1 + 1e-9` equals `bounces` and successive extremum deviations strictly decrease; `InvalidEffectParamsError`. Property tests using `arbScaleBounceParams`: Property 1 determinism, Property 2 bounded, Property 3 terminal identity, Property 7 scale-bounce envelope/count/terminal.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 10.1, Requirement 10.2, Requirement 10.3, Requirement 10.4, Requirement 10.5, Requirement 10.6, Requirement 10.7, Requirement 10.8, Requirement 10.9, Requirement 10.10, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/scale-bounce` (from `packages/engine`) passes with zero failures.

  - [ ] 5.2 Implement `spotlight` effect with unit and property tests
    - Create `packages/engine/src/effects/spotlight/schema.ts` (`startDelay`, `durationSeconds`, `radius`, `dimOpacity`, `settleAtEnd` boolean; `.finite()`, hard min/max per Requirement 11.3, defaults), `index.ts` (`s = clamp((t - startDelay)/durationSeconds, 0, 1)`; `groupCount <= 1` → `opacity 1`; else `f = s * (groupCount - 1)`, `d = abs(groupIndex - f)`, `opacity = d <= radius ? 1 : clamp(1 - (d - radius) * (1 - dimOpacity), dimOpacity, 1)`; `settleAtEnd && s >= 1` → `opacity 1`; `settleAtEnd === false` keeps dimming after sweep; `register`; throws `InvalidEffectParamsError`), and `spotlight.test.ts`.
    - Tests: unit sampling the focus sweep at `s = 0`, `s = 0.5`, `s = 1`; `groupCount = 1` → `opacity 1`; both `settleAtEnd` values (true → terminal identity at `s >= 1`; false → continues dimming); `InvalidEffectParamsError`. Property tests using `arbSpotlightParams`: Property 1 determinism, Property 2 bounded (`opacity` in `[dimOpacity, 1]` ⊂ `[0,1]`), Property 3 terminal identity under `settleAtEnd = true`.
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.5, Requirement 11.1, Requirement 11.2, Requirement 11.3, Requirement 11.4, Requirement 11.5, Requirement 11.6, Requirement 11.7, Requirement 11.8, Requirement 16.1, Requirement 16.2, Requirement 16.3, Requirement 16.5
    - **Completion:** `pnpm vitest run src/effects/spotlight` (from `packages/engine`) passes with zero failures.

  - [ ] 5.3 Implement `wave` effect with unit and property tests
    - Create `packages/engine/src/effects/wave/schema.ts` (`periodSeconds`, `amplitude`, `axis` `x`|`y` default `y`, `phasePerGroup`; `.finite()`, hard min/max per Requirement 12.2, defaults), `index.ts` (`theta = 2 * PI * (t / periodSeconds) + groupIndex * phasePerGroup`; `m = amplitude * sin(theta)`; `positionOffset = axis === "x" ? [m, 0] : [0, m]` clamped per axis to `[-32000, 32000]`; looping — no terminal identity; `register`; throws `InvalidEffectParamsError`), and `wave.test.ts`.
    - Tests: unit sampling `positionOffset` across one period on each axis; `InvalidEffectParamsError`. Property tests using `arbWaveParams`: Property 1 determinism, Property 2 bounded, Property 4 loop-period (`positionOffset(t) == positionOffset(t + periodSeconds)`).
    - **Covers:** Requirement 1.1, Requirement 1.2, Requirement 1.3, Requirement 1.5, Requirement 1.7, Requirement 1.9, Requirement 1.10, Requirement 2.8, Requirement 12.1, Requirement 12.2, Requirement 12.3, Requirement 12.4, Requirement 12.5, Requirement 12.6, Requirement 16.1, Requirement 16.2, Requirement 16.3
    - **Completion:** `pnpm vitest run src/effects/wave` (from `packages/engine`) passes with zero failures.
    - Commit: `feat(effect-presets): add scale-bounce, spotlight, wave effects`

  - [ ] 5.4 Checkpoint — Group 3c
    - Run `pnpm --filter @studio/engine exec tsc --noEmit`, `pnpm --filter @studio/engine lint`, and `pnpm vitest run src/effects` (from `packages/engine`).
    - **Completion:** All three commands exit with code 0 and zero failures.

- [ ] 6. Group 4: Registration, catalog, and drift guard
  - [ ] 6.1 Wire all ten effects into `registerBuiltinEffects` and extend registration tests
    - Edit `packages/engine/src/effects/index.ts`: import each new effect's `register` and invoke it once per `registerBuiltinEffects` call alongside `typewriter` and `fade-slide`, so `builtinRegistry` holds exactly twelve ids.
    - Add/confirm tests in `packages/engine/src/effects/index.test.ts`: exactly twelve ids registered; no `DuplicateEffectError` on a fresh `createRegistry()` + `registerBuiltinEffects`; `DuplicateEffectError` on a second `registerBuiltinEffects`; `get(id)` resolves each of the twelve ids; `get(unknown)` returns `undefined`.
    - **Covers:** Requirement 13.1, Requirement 13.2, Requirement 13.3, Requirement 13.4, Requirement 13.5, Requirement 13.6
    - **Completion:** `pnpm vitest run src/effects/index.test.ts` (from `packages/engine`) passes with zero failures.

  - [ ] 6.2 Create the preset catalog and re-export it
    - Create `packages/engine/src/effects/catalog.ts` exporting `Granularity`, `PresetCatalogEntry`, and `presetCatalog` — exactly twelve entries (`typewriter`, `fade-slide`, and the ten new effects). Each entry's `displayName` matches the registered `EffectDefinition.displayName` codepoint-for-codepoint; `defaultParams` equals that effect's schema defaults; `supportedGranularities` is a non-empty distinct subset of `{character, word, line}`; `loop` is `true` only for `wave` and `neon-flicker`. Plain data — MUST NOT throw at module load.
    - Re-export `presetCatalog` and `PresetCatalogEntry` from `packages/engine/src/index.ts`.
    - **Covers:** Requirement 14.1, Requirement 14.2, Requirement 14.3, Requirement 14.4, Requirement 14.5
    - **Completion:** `pnpm --filter @studio/engine exec tsc --noEmit` passes; importing `catalog.ts` does not throw.

  - [ ] 6.3 Write the catalog–registry drift guard (Property 8)
    - Create `packages/engine/src/effects/catalog.test.ts` tagged `// Feature: effect-presets, Property 8: Catalog–registry drift guard`: build a registry via `createRegistry()` + `registerBuiltinEffects`, then assert every catalog id is registered; entry count equals registered-effect count with no duplicate ids; each `displayName` matches the registered `EffectDefinition.displayName` exactly; each `defaultParams` passes the effect's `paramSchema.safeParse`; each `supportedGranularities` is a non-empty, distinct subset of the three (length 1..3); `loop` is `true` only for `wave` and `neon-flicker`.
    - **Covers:** Requirement 15.1, Requirement 15.2, Requirement 15.3, Requirement 15.4, Requirement 15.5
    - **Completion:** `pnpm vitest run src/effects/catalog.test.ts` (from `packages/engine`) passes with zero failures.
    - Commit: `feat(effect-presets): register built-ins and add preset catalog with drift guard`

  - [ ] 6.4 Checkpoint — Group 4
    - Run `pnpm --filter @studio/engine exec tsc --noEmit`, `pnpm --filter @studio/engine lint`, and `pnpm vitest run src/effects/index.test.ts src/effects/catalog.test.ts` (from `packages/engine`).
    - **Completion:** All three commands exit with code 0 and zero failures.

- [ ] 7. Group 5: Documentation
  - [ ] 7.1 Document the ten new effects and their approximations
    - Update `packages/engine/CONTRIBUTING.md` and `docs/effect-pack-format.md` to describe the ten new effects and each effect's supported granularities, and to state the explicit approximations: `letter-spread` → per-group additive `positionOffset` standing in for letter spacing; `line-wipe` → per-group opacity threshold sweep plus short fade standing in for a continuous clip wipe; `spotlight` → distance-based opacity modulation standing in for a true spotlight gradient.
    - Add the caveat that for staggered effects a group whose stagger start time falls at or after the layer's active end never reaches `p = 1` and therefore never completes — authors must choose `delayPerGroup`, `startDelay`, `durationSeconds`, and the layer duration together. No new dependency.
    - **Covers:** Requirement 2.1, Requirement 2.9, Requirement 6.2, Requirement 7.2, Requirement 11.2, Requirement 13.7
    - **Completion:** Both docs describe all ten effects, their supported granularities, the three approximations, and the stagger-past-end caveat; no dependency added.
    - Commit: `docs(effect-presets): document new effects, approximations, and stagger-past-end caveat`

  - [ ] 7.2 Checkpoint — Group 5
    - Review the updated docs for completeness (markdown sanity); confirm no new dependency was introduced.
    - **Completion:** Docs reviewed; both files render as valid markdown and reference every new effect.

- [ ] 8. Group 6: Final checkpoint
  - [ ] 8.1 Run the full workspace suite and confirm no drift
    - Run the root `pnpm test` (whole workspace) and confirm zero failures across typecheck, lint, and the full Vitest suite.
    - Confirm no new third-party dependency was added (no change to any `package.json` dependencies/devDependencies) and that `tsconfig` files are unchanged.
    - **Covers:** Requirement 1.12, Requirement 16.6
    - **Completion:** Root `pnpm test` exits with code 0 and zero failures; no new dependency and no `tsconfig` change are present.

---

## Notes

- No tasks in this plan are optional. Every task, including every property-based test, is required per the spec — there are no `*`-marked sub-tasks.
- Every property-based test is tagged `// Feature: effect-presets, Property N: …` and runs a minimum of 100 fast-check iterations; each cites the requirement clauses it validates.
- The `drawFrame` segment-pivot change (Group 1) is the single behavioral change to existing engine rendering code and lands first on its own commit; the `typewriter`/`fade-slide` golden images must stay pixel-identical (Requirement 17.9).
- Group 2 arbitraries are authored before the Group 3 schemas; they encode the same bounds the per-effect schemas enforce, and each effect's property tests import its arbitrary.
- The three effect batches (3a, 3b, 3c) are sequential because each shares a single commit and checkpoint; effects within a batch are independent.
- No new third-party dependency is added and no `tsconfig` change is made anywhere in this plan.
- Repo commands: `pnpm --filter @studio/engine exec tsc --noEmit` (typecheck), `pnpm --filter @studio/engine lint` (lint), `pnpm vitest run <path>` run from `packages/engine` (targeted tests), and the root `pnpm test` (full workspace) in the final checkpoint.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 6, "tasks": ["3.5"] },
    { "id": 7, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 8, "tasks": ["4.4"] },
    { "id": 9, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 10, "tasks": ["5.4"] },
    { "id": 11, "tasks": ["6.1", "6.2"] },
    { "id": 12, "tasks": ["6.3"] },
    { "id": 13, "tasks": ["6.4"] },
    { "id": 14, "tasks": ["7.1"] },
    { "id": 15, "tasks": ["7.2"] },
    { "id": 16, "tasks": ["8.1"] }
  ]
}
```
