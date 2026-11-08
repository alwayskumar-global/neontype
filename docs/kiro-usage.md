# Kiro usage

This repository was built spec-first in Kiro. Every line of code was written in
Kiro; planning and visual design were done outside it (with Claude and Claude
Design). The notes below are drawn from the repo's `.kiro/` artifacts and the
git history.

## Spec-driven workflow

Four specs under `.kiro/specs/` each progressed requirements -> design -> tasks
-> implementation, one task group per commit:

- `engine-core` (15 requirements): the pure, deterministic render core.
- `effect-presets` (17 requirements): the 12 built-in effects and the catalog.
- `exporters` (14 requirements): client-side MP4 / PNG-sequence / GIF export.
- `studio` (15 requirements): the editor app.

Requirements are written in EARS form with per-criterion verification methods;
designs enumerate numbered correctness properties; tasks cite the requirements
and properties they satisfy. Decisions that came up mid-build were captured as
spec amendments with their own commits rather than silent changes — for example
`docs(studio): scope csp violation allowance` and `docs(studio): tighten csp and
dependency pins`.

## Steering

`.kiro/steering/` encodes the always-on rules the build obeyed: `tech.md`
(TypeScript strict, pnpm workspaces, Vite + React, Vitest + fast-check,
Playwright, and the rule that `renderFrame` is pure and deterministic — no
`Math.random`/`Date.now`/`performance.now`, no DOM reads), `product.md` (scope,
non-goals, client-only constraints), and `structure.md` (package boundaries:
engine depends on nothing, exporters and the app depend on engine).

## Hooks

`.kiro/hooks/` has four: engine lint on save, package tests on save, a purity
check flagging banned wall-clock/randomness outside the studio playback clock,
and a dependency-log reminder on `package.json` changes.

## Property-based testing and what it caught

32 numbered fast-check properties guard invariants across the packages. Real
catches during the build, from the task history and commits:

- Exporters Property 4 produced a counterexample (canvas 17x38, output 4x10)
  that exposed a wrong aspect-ratio check; the production `validate.ts` rule was
  corrected.
- Exporters Property 10 failed at frameCount=1 from an async fast-check misuse,
  fixed by switching to `asyncProperty`.
- The export worker host's backpressure test caught a getter-copy bug in a mock
  that was masking a real queue-bound assertion.
- The blur golden (preview/export parity) caught that the exporter blur diverged
  from the native filter; the fix was a premultiplied-alpha box blur with an
  area-averaging downsample.
- `fix(engine-core): enforce R1.4 magnitude ranges and full limit coverage in
  Property 12` (commit `ea3db49`) tightened a range the property revealed.

## What the deterministic-engine rules caught

The ESLint purity bans (and their guard tests) kept clocks and randomness out of
the model and render paths; the studio confines the only animation clock to
`apps/studio/src/playback/`. Preview and every export call the same
`renderFrame`, verified by a parity Playwright test, so "what you see is what you
export" holds by construction rather than by convention.
