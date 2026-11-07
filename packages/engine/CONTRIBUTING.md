# Contributing to `@studio/engine`

The engine is the deterministic, pure render core of the studio. Preview, every
exporter, and all tests call the same `renderFrame`, which composes
`computeFrameState` (pure data in, data out) and `drawFrame` (a thin Canvas2D
painter). Everything below exists to keep that core pure and reproducible.

Intra-package imports use ESM paths with explicit `.js` extensions (for example
`import { evaluate } from "../../easing.js"`), even though the sources are
TypeScript.

## 1. Directory structure

Each effect lives in its own directory named by its `kebab-case` id:

```
packages/engine/src/effects/<kebab-id>/
  index.ts       – effect implementation; exports `register(registry)`
  schema.ts      – Zod schema for the effect's params
  *.test.ts      – unit tests + at least one property-based test
```

The effect `id` string MUST match the directory name (both `kebab-case`). After
creating the directory, register the effect in the effect registry (see below).
If you change the on-disk effect-pack format, update
[`docs/effect-pack-format.md`](../../docs/effect-pack-format.md).

See the two reference effects for the full shape:
`src/effects/typewriter/` and `src/effects/fade-slide/`.

## 2. Registration pattern

An effect's `index.ts` exports a single registration function:

```ts
export function register(registry: EffectRegistry): void {
  registry.register({
    id: "typewriter",
    displayName: "Typewriter",
    paramSchema: TypewriterParamsSchema,
    applyEffect,
  });
}
```

Rules:

- The module MUST NOT call `register` at load time. There is no top-level
  side-effect registration — importing an effect module registers nothing on
  its own. A caller must invoke `register(registry)` explicitly.
- `applyEffect` must be pure: it derives its result only from its arguments,
  validates incoming `params` with the effect's Zod schema via `safeParse`, and
  throws `InvalidEffectParamsError` on invalid params. No clocks, randomness, or
  DOM access.

The default built-in registry is assembled in `src/effects/index.ts`:

- `registerBuiltinEffects(registry)` imports each effect's `register` (aliased,
  e.g. `registerTypewriter`, `registerFadeSlide`) and calls them on the passed
  registry. Adding a new built-in effect means adding one `register` call here.
- `builtinRegistry` is a module-level constant: a fresh `createRegistry()` that
  has `registerBuiltinEffects` called on it at module load. This module is the
  single place that performs that assembly; the registry module (`registry.ts`)
  itself does no load-time registration.

To add a new built-in effect: create its directory (section 1), then import and
call its `register` from `registerBuiltinEffects` in `src/effects/index.ts`.

## 3. Test requirements

Every effect needs at least one unit test AND at least one property-based test,
co-located as `*.test.ts` in the effect directory.

- Use a fresh registry per test: `const registry = createRegistry();` then
  `register(registry);` and `registry.get("<id>")`. Do not rely on
  `builtinRegistry` shared state.
- Exercise the effect through `computeFrameState` where practical, using the
  deterministic `FakeMetricsProvider` (no DOM access) for text metrics so the
  test runs in Node.
- Property-based tests use `fast-check`: wrap the property in `fc.assert` and
  tag it with its property number and requirement (for example
  `// Feature: engine-core, Property 14: ...`). Implement only the named/numbered
  properties from the design; ask before adding a new one.

Reference examples:

- `src/effects/typewriter/typewriter.test.ts` — unit tests plus Properties 14
  and 16, using `arbTypewriterParams` / `arbTypewriterBackwardParams`.
- `src/effects/fade-slide/fade-slide.test.ts` — unit tests plus Property 15,
  using `arbFadeSlideParams`.

Reusable generators live in `src/testing/arbitraries.ts`; add new effect-param
arbitraries there. A passing `pnpm --filter @studio/engine exec vitest run` is
required before merging.

## 4. ESLint purity rules

The engine must be deterministic: the same inputs in the same runtime produce
identical output. The following are BANNED in `src/**`:

- `Math.random` — use `createPRNG` (seeded) for all randomness. Derive
  per-segment streams with `derivePRNG`; the seed is stored in the project.
- `Date.now`
- `performance.now`

The ban is enforced by the `no-restricted-properties` rule in
`eslint.config.js` and guarded by the purity test at
`src/__tests__/eslint-purity.test.ts`, which asserts all three bans fire. Run
`pnpm --filter @studio/engine lint` locally. Do not add `eslint-disable` in
`src`.

## 5. Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `chore:`, `docs:`, `test:`, `refactor:`, etc. Keep one logical change
per commit, and reference the spec task id in the commit message when the work
maps to a spec task. Example:

```
feat(engine-core): ESLint purity test, Kiro hook, and CONTRIBUTING.md
```
