# Effect-pack format and built-in preset effects

This document describes the built-in preset effects shipped in
`@studio/engine`, the granularities each supports, the faithful approximations a
few of them use, and a timing caveat for staggered effects. The authoritative
definition of every effect's params is its Zod `schema.ts`; the
machine-readable catalog of all built-ins (id, display name, description,
supported granularities, default params, loop flag) is exported as
`presetCatalog` from the engine.

All effects are pure and deterministic: any randomness flows only through the
per-segment seeded PRNG (`args.prng`). Each effect's `applyEffect` returns only
the existing `SegmentOverrides` fields (`opacity`, `positionOffset`, `scale`,
`rotation`, `blur`, `color`) and clamps every numeric field to the ranges
`drawFrame` accepts (`opacity [0,1]`, `scale [0,100]`, `blur [0,1000]`,
`rotation [-36000,36000]`, each `positionOffset` axis `[-32000,32000]`).

## Granularity

Every effect is applied at a chosen granularity — `character`, `word`, or
`line` — which determines what a "group" is. All twelve built-ins (the two
reference effects plus the ten presets below) support all three granularities.
`groupIndex` is the 0-based index of a group within its granularity and
`groupCount` is the total number of groups; together they drive each effect's
per-group stagger or position.

## Stagger-past-layer-end caveat

Staggered effects derive each group's animation start from its `groupIndex`, the
effect's stagger param (`delayPerGroup`), and `startDelay`. A group whose
staggered start time falls at or after the layer's active end **never reaches
progress `p = 1` within the layer's lifetime and therefore never completes its
animation** (it is frozen mid-animation when the layer ends). Choose
`delayPerGroup`, `startDelay`, `durationSeconds`, and the layer's duration
together so that every group that should complete does so before the layer ends.
For example, with `groupCount` groups and a per-group delay `delayPerGroup`, the
last group starts at roughly `startDelay + (groupCount - 1) * delayPerGroup` and
needs a further `durationSeconds` to finish.

## Approximations

Three effects approximate a visual their names imply but `SegmentOverrides`
cannot express directly. Each uses the closest faithful approximation:

- **letter-spread** approximates letter spacing (which `SegmentOverrides` cannot
  express directly) with a per-group additive `positionOffset` along one axis:
  the offset magnitude scales with the group's distance from the group center,
  `(groupIndex - (groupCount - 1) / 2) * spreadDistance * (1 - eased)`.
- **line-wipe** approximates a continuous clip wipe with a per-group opacity
  threshold sweep plus a short per-group fade: each group reveals once time
  crosses its threshold, ramping over `fadeSeconds`.
- **spotlight** approximates a moving spotlight gradient by modulating each
  group's `opacity` based on its index distance from a moving focus position;
  it does not paint a true gradient.

## Preset effects

| id | supported granularities | loop | summary |
|----|-------------------------|------|---------|
| `blur-in` | character, word, line | no | Resolves each group from a blurred, transparent start into focus. |
| `glitch-reveal` | character, word, line | no | Reveals each group with a brief seeded jitter that decays to 0. Time-quantized into `steps` cells so the jitter varies over time from the per-frame-stateless PRNG. |
| `kinetic-pop` | character, word, line | no | Pops each group in with a scale overshoot peaking at `max(startScale, 1 + overshoot)` then settling to 1. |
| `letter-spread` | character, word, line | no | Opens each group outward from its layout and settles back (letter-spacing approximation). |
| `line-wipe` | character, word, line | no | Sweeps a reveal across the groups in order (clip-wipe approximation). |
| `neon-flicker` | character, word, line | **yes** | Flickers each group's brightness on a fixed loop. Time-quantized into `cellsPerPeriod` cells; repeats exactly every `periodSeconds`. |
| `rotate-drop` | character, word, line | no | Drops each group into place while rotating to upright. |
| `scale-bounce` | character, word, line | no | Bounces each group in with a damped scale overshoot (exactly `bounces` overshoots above 1; `bounces = 0` rises monotonically). |
| `spotlight` | character, word, line | no | Moves a brightened focus across the groups, dimming the rest (gradient approximation). |
| `wave` | character, word, line | **yes** | Oscillates each group along an axis with a traveling phase; repeats every `periodSeconds`. |

### Looping effects

`neon-flicker` and `wave` are looping effects: they repeat on a fixed
`periodSeconds` and never settle into a terminal identity state, so they are
exempt from the "end in the identity state" rule that the non-looping effects
follow. Both derive time-varying output solely from the loop phase, so their
output at time `t` equals their output at `t + periodSeconds`.

### Randomness and determinism

`glitch-reveal` and `neon-flicker` use `args.prng`. Because the engine derives a
fresh PRNG per group per frame (it is not time-dependent), these effects quantize
time into an integer index (`steps` for glitch-reveal, `cellsPerPeriod` for
neon-flicker), draw `index + 1` values, and use the last — so the random value
changes across time cells while remaining identical for the same
`(seed, t, groupIndex, params)`.
