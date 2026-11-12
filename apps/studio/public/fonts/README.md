# Bundled fonts
Self-hosted, SIL Open Font License 1.1. No font is requested from a third party at runtime.
| Family | Files | Licence text | Used by |
|---|---|---|---|
| Noto Sans | `noto-sans-latin-{400,700}-normal.woff2` | `OFL-Noto-Sans.txt` | canvas, exports, studio UI |
| Noto Sans Tamil | `noto-sans-tamil-tamil-{400,700}-normal.woff2` | `OFL-Noto-Sans-Tamil.txt` | canvas, exports, studio UI |
The Noto files are copied from the `@fontsource/noto-sans` and `@fontsource/noto-sans-tamil` packages.
The design-system fonts (Instrument Sans, DM Mono) are not here: they live in `src/ds/fonts/` with their own
README, so the default production build does not ship them. The design system's Noto Sans Tamil face is
deliberately not copied: the studio already declares that family, and a second declaration with different
files would change canvas and export glyphs.
