# @studio/app

The browser-only motion-text studio. Vite + React + strict TypeScript. It owns no rendering, schema
or encoding logic: pixels come from `@studio/engine`, exports from `@studio/exporters`.

```
pnpm --filter @studio/app dev          # dev server (port 5273)
pnpm --filter @studio/app build        # static build into dist/ (strict CSP injected into index.html)
pnpm --filter @studio/app exec vitest run
pnpm --filter @studio/app exec playwright test tests/
pnpm --filter @studio/app exec playwright test --config playwright.csp.config.ts   # needs a prior build
pnpm --filter @studio/app test:dc      # dc-harness smoke test (builds and serves its own output)
```

## `design/` is a visual reference only

`design/` holds the owner's exported mockups. It is never served, bundled or imported. Screens are
rebuilt as React components; the converter below reads `design/` as **input** and writes plain,
committed source into `src/generated/`. Nothing at runtime or build time imports from `design/`
(a unit test builds the app and the harness in memory and scans the output).

## Design-source converter

`scripts/dc-convert-lib.mjs` turns a design-tool `.dc.html` screen into a typed React component and
scoped CSS. Node >= 20 built-ins only, no dependency, and **deterministic**: identical input gives
byte-identical output.

```
pnpm --filter @studio/app dc:convert     # regenerate src/generated/ from design/ (never hand-edit it)
```

Reads the five screens listed in `scripts/dc-convert.config.json` and writes
`src/generated/<slug>/<Name>.tsx`, `<slug>.css` and any referenced images (copied byte for byte).

| In the design file | In the output |
| --- | --- |
| `style="..."` (static) | a scoped class `.dc-<slug> .dc-<slug>-s<hash>` |
| `style="... {{ x }} ..."` (dynamic) | the same kind of class reading `var(--dc-N)`; the element sets that custom property from a ref through `setCssVars` (CSSOM, so the strict CSP allows it) |
| `style-hover/-focus/-active` | `:hover` / `:focus` / `:active` rules on that class |
| `{{ a.b }}` | a safe lookup in the component's `data` (a missing path is `undefined`, never an error) |
| `<sc-if>` / `<sc-for>` | a conditional / a list with its own scope and `$index` |
| `<x-import ...Button>` | the ported design-system component (12 are supported) |
| `<helmet><style>` | CSS scoped under `:where(.dc-<slug>)`; `html`/`body`/`:root` become the root; keyframes are prefixed |
| `<dc-import name=...>` | a `backdrop` prop slot |
| support runtime, the data `<script>`, the bundle `<script>` | dropped, never executed or embedded |

Anything outside the supported grammar is a build error with `file:line`; the converter never
guesses. The generated output never contains a `style=` attribute or JSX `style` prop,
`dangerouslySetInnerHTML`, a `<script>` or `<style>` element, a remote URL, or an import from
`design/`. Per-file rules (`omitIf`, `replaceText`, `forbid`) live in `dc-convert.config.json`.

A generated component is a pure function of `{ data, backdrop? }`. **Wiring a generated screen into
the live studio (routes, state) is out of scope and needs its own spec.**

## Design-system port (`src/ds/`)

`ds.css` is a hand-assembled copy of the design-system export's tokens and component styles (its
header names the source export id). Tokens are scoped under `.ds-root`, not the document root, because
44 token names collide with `src/tokens.css` (16 with different values). `index.tsx` ports only the 12
components the mockups use; icons are typed shape data (no HTML injection); dynamic values go through
`setCssVars`.

Fonts: Instrument Sans and DM Mono live in `src/ds/fonts/` with their SIL OFL texts (sources and commits
in `src/ds/fonts/README.md`) and are bundled only into builds that import `ds.css`, not into the default dist. The design system's own Noto Sans Tamil face is **not**
ported: the studio already declares that family, and a second declaration with different files would
change canvas and export glyphs. A test asserts `ds.css` and `src/fonts/fonts.css` share no family.

## Deviations from the original request (all approved by the owner)

1. **No React `style` objects.** Dynamic styles use a class plus a CSS custom property set via
   `setCssVars`, because Requirement 11.2 and an ESLint rule forbid any JSX `style` prop.
2. **Scoped tokens.** `ds.css` and `generated/` carry the design's literal values, a documented
   exception to "no hard-coded values" that covers `generated/` and `ds/` only.
3. **Config rules:** Landing links become `href="#studio"` with an optional `onOpenStudio` handler
   from the data; the Export Flow "Review bar" is omitted; Error States icon colours come from a
   class per variant (`data-variant`).
4. **Known visible differences:** `dc-props` (a full-width hint) is not applied; whitespace-only text
   between inline siblings is dropped; `html`/`body` rules apply to the screen root, so a host must
   give the screen a sized container.
