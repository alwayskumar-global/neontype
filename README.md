# Motion-text studio

A browser-only, fully client-side motion-text studio: type text, apply a preset
effect, tweak timing, preview on a canvas, and export to MP4, a PNG sequence
(ZIP), or GIF — no backend, no accounts, no network calls at runtime.

> This README is the minimal version. It is expanded in the studio spec's
> Group 7 (disclosure, "Built with Kiro", and the Vercel deploy section).

## Prerequisites

- Node.js >= 20
- pnpm 10 (the repo pins pnpm 10; `corepack enable` recommended)

## Install / dev / test / build

```bash
pnpm install                         # install the workspace
pnpm --filter @studio/app dev        # run the studio dev server (Vite)
pnpm test                            # whole-workspace typecheck + lint + vitest
pnpm --filter @studio/app exec playwright test   # studio browser tests
pnpm --filter @studio/app build      # build the static studio to apps/studio/dist
```

## Workspace layout

```
packages/engine/      Pure render core (computeFrameState / drawFrame / renderFrame), Zod Project schema.
packages/exporters/   Client-side MP4 / PNG-sequence / GIF export + capability detection.
apps/studio/          The studio app (Vite + React): preview, panels, export.
docs/                 Project docs, including the dependency log.
.kiro/                Specs, steering, and hooks used to build the project.
```

## Dependencies

Every third-party dependency (name, exact version, license, reason) is recorded
in [`docs/dependencies.md`](docs/dependencies.md).
