# Tech
- TypeScript strict, pnpm workspaces, Vite + React (studio UI), Vitest + fast-check (property-based tests), Playwright (smoke/visual).
- Rendering: Canvas2D first. WebGL only if an effect needs it.
- Core rule: renderFrame(project, tSeconds, opts) is pure and deterministic. No Date.now, Math.random, DOM reads or network. Randomness comes only from a seeded PRNG stored in the project.
- Preview, every exporter and the tests all call renderFrame. Never duplicate render logic.
- Schemas (Zod) are the source of truth. Generate JSON Schema from them.
- Client-only. No runtime third-party requests, no analytics, no secrets. Fonts must be OFL and self-hosted; audio CC0 or royalty-free.
- Dependencies: permissive licenses only (MIT/Apache/BSD). Log each in docs/dependencies.md with the reason.
- Never put keys in .kiro or the repo. MCP config uses env-var references only.