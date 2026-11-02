# Structure

```
packages/engine/src/       – Zod schemas, effect registry, renderFrame. Zero DOM deps except Canvas types.
packages/exporters/src/    – MP4, PNG-seq, WebM-alpha, GIF/WebP, Lottie. Each exporter calls renderFrame; no inline render logic.
packages/embed/src/        – <motion-text> web component (wraps engine, no studio deps).
apps/studio/src/           – Editor UI. Imports from packages; never re-exports engine internals.
docs/
  dependencies.md          – Every third-party dep with license and reason.
  effect-pack-format.md
```

**Package rules:**
- `engine` has no dependency on `exporters`, `embed`, or `studio`.
- `exporters` and `embed` depend on `engine` only.
- `studio` may depend on all packages but owns no rendering or schema logic.
- New packages require a `README.md` and an entry in `docs/dependencies.md` for any new deps.

**Adding an effect:** create `packages/engine/src/effects/<kebab-id>/` with `index.ts` (effect impl), `schema.ts` (Zod), and `*.test.ts`. Register it in the effect registry. Update `docs/effect-pack-format.md` if the format changes.
