# Motion-text studio

A browser-only, fully client-side studio for classic kinetic-typography text animation: type
text, apply a preset effect, tweak timing with numeric controls, preview on a
canvas, and export — no backend, no accounts, and no network calls at runtime.

## What it does

- Live canvas preview driven by a pure, deterministic render engine.
- Text layers with per-layer font (Noto Sans / Noto Sans Tamil, 400/700), size,
  colour, alignment, position, and numeric start/duration.
- 12 preset text-animation effects with editable parameters and granularity.
- Export to MP4 (H.264 + optional AAC), a PNG sequence (ZIP), and GIF.
- Save/load projects as validated JSON.

## Prerequisites

- Node.js >= 20 (developed on Node 25)
- pnpm 10 (`corepack enable`; the repo uses pnpm 10.33)

## Install / dev / test / build

```bash
pnpm install                                      # install the workspace
pnpm --filter @studio/app dev                     # studio dev server (Vite)
pnpm test                                         # whole-workspace typecheck + lint + vitest
pnpm --filter @studio/app exec playwright test    # studio browser tests (dev server)
pnpm --filter @studio/app exec playwright test --config playwright.csp.config.ts   # CSP test (prod preview)
pnpm --filter @studio/app build                   # static build to apps/studio/dist
```

## Workspace layout

```
packages/engine/      Pure render core: computeFrameState / drawFrame / renderFrame; Zod Project schema; 12 preset effects.
packages/exporters/   Client-side MP4 / PNG-sequence / GIF export + capability detection.
apps/studio/          The studio app (Vite + React): preview, panels, export dialog, save/load.
docs/                 Dependency log and project docs (incl. docs/kiro-usage.md).
.kiro/                Specs, steering, and hooks used to build the project.
```

## Export formats

Supported: **MP4** (H.264, optional AAC), **PNG sequence** (ZIP of stored PNGs),
**GIF** (<=256-colour palette, single-colour transparency).

Deferred (not in this release; typed stubs that report unsupported): **WebM with
alpha** (VP9 alpha unsupported in tested Chrome configurations) and **animated
WebP** (needs a hand-written RIFF container). The export dialog offers only the
three supported formats and gates them by runtime capability detection.

## Built with Kiro

This project was built spec-first in Kiro:

- **Specs** (`.kiro/specs/`): `engine-core` (15 requirements), `effect-presets`
  (17), `exporters` (14), and `studio` (15) — each with requirements, design, and
  an ordered task plan, driven to implementation group by group.
- **Steering** (`.kiro/steering/`): `product.md` (scope and non-goals),
  `tech.md` (TypeScript strict, pnpm workspaces, Vite + React, Vitest +
  fast-check, Playwright; the pure/deterministic `renderFrame` rule), and
  `structure.md` (package boundaries and naming).
- **Hooks** (`.kiro/hooks/`): run package tests on save, flag banned wall-clock /
  randomness outside the playback clock, and remind to record dependencies.
- **Property-based testing** (fast-check): 32 numbered properties across the
  packages guard invariants (frame-count formula, determinism, schema-preserving
  edits, ZIP CRC, GIF delay/palette, save/load round-trip, and more).

See [`docs/kiro-usage.md`](docs/kiro-usage.md) for a factual write-up of the
Kiro workflow and what the specs, hooks, and property tests caught.

## Deploy (Vercel, static)

- Root directory: `apps/studio`
- Build command: `pnpm --filter @studio/app build`
- Output directory: `dist`
- The strict Content-Security-Policy is injected into the built `index.html` and
  served as an HTTP header via `apps/studio/vercel.json` (no `'unsafe-inline'`).

## Known limitations

- Heavy blur previews slowly on large canvases (the per-frame deterministic blur
  is expensive); exports are exact — preview and export use the same render path.
- The Vite dev server runs without CSP (HMR needs inline/eval); the strict CSP
  applies to the production build and is tested against `vite preview`.
- Under the strict CSP, exactly one caught feature probe fires (Zod's guarded
  `allowsEval`, `script-src`/`eval`); `'unsafe-eval'` is not used.
- No timeline UI — layer timing is edited with numeric start/duration fields.
- No audio UI (the exporters support an AAC track; the studio does not expose it).
- No undo/redo.

## Third-party and disclosure

Planning and visual design were produced OUTSIDE Kiro, with Claude and Claude
Design; the design files under `design/` are a visual reference only and are not
served or bundled. ALL code in this repository was written in Kiro. Every
third-party dependency (name, exact version, license, reason) is recorded in
[`docs/dependencies.md`](docs/dependencies.md).
