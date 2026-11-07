# Tech

**Stack:** TypeScript (strict), pnpm workspaces, Vite + React (studio UI), Vitest + fast-check (property-based), Playwright (smoke/visual).

**Rendering:** Canvas2D by default; WebGL only when an effect explicitly requires it.
`renderFrame(project, tSeconds, opts)` must be pure and deterministic — no `Date.now`, `Math.random`, DOM reads, or network calls. All randomness comes from a seeded PRNG stored in the project. Preview, every exporter, and all tests call the same `renderFrame`; never duplicate render logic. Determinism means the same inputs in the same runtime produce identical output. Golden images are generated and compared in Chromium only.

`renderFrame(project, t, opts)` composes two functions. `computeFrameState(project, t)` is pure data in and data out, with no canvas or DOM access. `drawFrame(ctx, state)` is a thin painter that draws a precomputed state onto a `CanvasRenderingContext2D`. Property-based tests target `computeFrameState` and run in Node. Only a small set of golden-image tests exercises `drawFrame`, in Chromium via Playwright.

**Schemas:** Zod definitions in `packages/engine` are the source of truth. Generate JSON Schema from them; do not hand-write JSON Schema.

**Client-only hard constraints:**
- No runtime third-party requests, analytics, or telemetry.
- Fonts: OFL, self-hosted. Audio: CC0 or royalty-free.
- Dependencies: MIT / Apache / BSD licenses only. Log each in `docs/dependencies.md` with the reason.
- No secrets or API keys anywhere in the repo or `.kiro`. MCP config uses env-var references only.

**Naming:** `camelCase` for variables/functions, `PascalCase` for types/components, `kebab-case` for filenames. Effect ids are `kebab-case` strings matching their directory name.

**Error handling:** Validate external input (project files, effect packs) with Zod `safeParse`. Throw typed errors for internal invariant violations. Never swallow errors silently.

**Testing:** unit tests co-located (`*.test.ts`); integration/visual tests in `tests/`. Property-based tests cover every effect with arbitrary inputs and seeded PRNGs. A passing test suite is required before merging.

**Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.). One logical change per commit; reference the spec task id when applicable.
