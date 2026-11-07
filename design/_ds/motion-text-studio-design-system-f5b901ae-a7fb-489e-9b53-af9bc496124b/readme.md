# Motion-text studio: design system

The design system for a browser-based **motion-text studio**. In the app you type text, apply animation presets, edit a keyframe timeline, and export an MP4, a web embed, a transparent PNG sequence or a GIF. It's built for small-business owners, creators and designers who make animated titles for social posts, slides and the web.

> **The product name is undecided.** The system has no logo and uses no product name. Wherever a mark would go, use the dashed **"Wordmark"** placeholder box (`.ui-wordmark`). The project is filed under the working description "Neontype" (company description only). Don't use that name in the UI.

## Sources
No codebase, Figma file or existing brand assets were supplied. The system was authored from scratch from a written brief. That brief asked for:
- Direction: a dark-first professional creative tool. The UI is precise and calm, with a restrained neon accent that nods to late-2000s Flash-era motion tools without going retro. The animated text on the stage is the hero.
- Deliverable: one self-contained HTML style guide (`Style Guide.html`) with all tokens as semantic CSS custom properties on `:root`, organised as Foundations → Components → Patterns → Screens.
- Hard constraints: no external requests (no CDN fonts, scripts or images), no third-party brand names or copied UI, visible keyboard focus everywhere, accessible names on every control, states that never rely on color alone, respect for `prefers-reduced-motion`, and minimal vanilla JS.

## Index
- `Style Guide.html` is the primary deliverable. It's a single self-contained page: tokens, component CSS and demo JS are inlined, and fonts load from `fonts/`. It has four parts: Foundations, Components (every state), Patterns, Screens.
- `styles.css` is the global entry point and contains only `@import`s.
- `tokens/` holds `fonts.css` (`@font-face`), `colors.css`, `typography.css`, `spacing.css` (space, sizes, radii, borders), `elevation.css` (shadows, glow, z-index) and `motion.css` (durations, easings, reduced twins).
- `components/ui.css` holds the component classes (`.ui-*`). The React components, the style guide and the UI kit all share it.
- `components/<group>/` holds the React components (`.jsx` + `.d.ts` + `.prompt.md`) plus one `@dsCard` card per group.
- `fonts/` holds the self-hosted SIL OFL woff2 files.
- `assets/icons/` holds 50 original SVG icons plus `sprite.svg`. The source of truth is `components/core/iconPaths.js`.
- `guidelines/` holds the foundation specimen cards for the Design System tab.
- `ui_kits/studio/` is the clickable app recreation: `index.html` (editing), `empty.html`, `first-run.html` and `start.html` (starting point).
- `guide/` holds the build sources for the style guide, kit and cards: `build.js`, `build-cards.js`, `gen-*.js`, `guide.css` and `behaviors.js`. Edit tokens or `ui.css`, then rerun the build (see "Rebuilding").
- `thumbnail.html` is the project tile.
- `SKILL.md` is the Agent Skill entry point.

## Components
All components live under `window.MotionTextStudioDesignSystem_f5b901` in cards. Each is a thin React wrapper over the `.ui-*` classes.
- **core/**: Icon, Button, IconButton, Tooltip
- **forms/**: Field, NumberScrub, Slider, ColorSwatch (+ ColorPicker), Select, TextArea, Toggle, SegmentedControl
- **navigation/**: Tabs
- **feedback/**: Toast, Modal, ProgressBar, WarningBanner
- **content/**: Chip, LayerRow, PresetCard, CodeBlock
- **timeline/**: TimelineRuler (+ formatTimecode), Playhead, Keyframe, EasingCurve (+ EASINGS), Checkerboard

Most components accept a `state` prop (`hover` / `active` / `focus`) so documentation can show forced states. In product code you rely on real pseudo-classes instead.

**Intentional additions:**
- `Field` is a label + control + help/error wrapper, so every field reports errors the same way.
- `Icon` wraps the original glyph set.
- `ColorPicker` is the popover body of ColorSwatch, exported for inline use.

## Content fundamentals
- **Voice**: a calm, competent studio assistant. Plain verbs and short sentences. Copy addresses the user as **you** ("Your reel is ready"). The product never says "I". "We" appears only for system work ("We'll tell you when it's done").
- **Casing**: Sentence case for everything: buttons, titles, tabs, menu items ("Export another format", "Text styles"). The one exception is UPPERCASE **caption** section headers with +6% tracking ("ENTRANCES", "LAYERS").
- **Buttons are verbs**: Export, Add text, Replace effect, Show file, Copy. Destructive buttons name the object: "Delete layer".
- **Errors and warnings** say what happened, what it means, and how to fix it: "Layer 'Glitch title' uses `fx.glitch-v3`, which this engine can't play. It will render without animation." followed by the action [Replace effect]. Never blame the user, and never use exclamation marks.
- **Empty states** tell you the next step in your own words, with one primary action: "Start with a line of text. Type a headline, then drop an effect on it from the library."
- **Numbers** are always mono, with units shown: `0.80 s`, `540 px`, `1080 × 1920`, `≈ 4.2 MB`. Use × for dimensions and MM:SS:FF timecode.
- **Engine vocabulary**: effect, preset, layer, keyframe, easing (linear / easeIn / easeOut / easeInOut, written exactly like that), split by Char / Word / Line, stagger, in/out, work area.
- **No emoji, no exclamation marks, no hype.** The headline on the stage is the user's content, and only that gets to shout.
- Tamil and other scripts are first-class. Character-split effects must split by grapheme cluster.

## Visual foundations
- **Color**: dark-first, built on cool-tinted neutrals (hue ≈ 250) from `#08090C` to `#F4F6F9`. There is one primary accent, **electric magenta** `#F23DC8`, which marks what you commit and select: primary buttons, selection, keyframes, toggle-on, slider fill. There is one secondary accent, **signal cyan** `#2DD3F0`, which marks where you are: the playhead, scrubbing, the work area and the keyboard focus ring. Semantic colors are green `#45D98F`, amber `#FFBC47`, red `#FF6B78` and blue `#6AABFF`. Each has a 300 text tint, a 700 border and a 900 surface. Every text pair passes AA and every UI boundary passes 3:1; the ratios are computed and listed in the guide.
- **Surfaces**: depth comes from stepped surfaces (canvas `950` → app `900` → panel `850` → raised `800` → control `750`) plus 1px dividers, not from shadows. The stage area is the darkest surface so animated type pops.
- **Glow**: used only on active, selected or focused elements. There are three glows: magenta `--glow-accent` (selected/pressed), cyan `--glow-accent-2` (scrubbing/dragging) and cyan `--glow-focus` (keyboard). Resting chrome never glows.
- **Type**: Instrument Sans for the UI, with dense sizes (13px body, 12px labels, 11px captions). DM Mono for every number. Noto Sans Tamil sits in the `--font-ui` fallback chain, so mixed strings just work.
- **Spacing**: a strict 4px scale. Controls are 24/28/36px, rows 32px, icons 20px (16px in buttons).
- **Radii**: small and precise. 2px for keyframes and kbd, 4px for inputs, chips and rows, 6px for buttons and cards, 8px for popovers and export cards, 12px for modals, pill for sliders and toggles.
- **Borders**: 1px everywhere. Input boundaries use `--color-border-control` (3:1 against the panel). Disabled controls drop their fill and switch to a **dashed** outline, so the state never depends on color.
- **Focus**: a 2px cyan outline with a 2px offset plus a soft glow, applied to every interactive element.
- **Motion**: chrome motion is short and quiet: 120ms for hover and press, 180ms for toggles, 280ms for popovers, 420ms for dialogs. Use easeOut for entering, easeIn for leaving, easeInOut for moving between two points, and linear for anything tied to time. There are no bounces in the chrome. Expressive motion belongs only to the stage and preset thumbnails, and thumbnails play only on hover or focus. Under reduced motion every token resolves to its `-reduced` twin: no travel, short opacity fades, linear easing, and static thumbnails.
- **Hover / press**: hover lifts the surface one step (or brightens the accent fill). Press steps one more, adds a 1px downward nudge, and for primary buttons adds the magenta glow.
- **Transparency and blur**: only the modal scrim uses them (72% + 4px blur). The transparency checkerboard (`#2A2F37` / `#1E222A`) appears behind transparent stages and alpha chips.
- **Imagery**: none in the chrome. Thumbnails are live text on black. Placeholders are CSS-only.
- **Cards**: raised surface with a 1px subtle border and 6–8px radius, no shadow. When selected, they take an accent border plus glow. Never use colored left-border accents.
- **Layout**: a fixed 48px top bar, side panels of 264px (220–360) and 304px (280–400), a flexible stage, and a 248px timeline (160 to 50% of the height). The minimum width is 1280px; below that, a narrow-screen message is shown via a container query.

## Iconography
- These are **original icons drawn for this system** (no icon library). There are 50 glyphs on a 20 × 20 grid with a 1.5px stroke, round caps and joins, a 2px keyline and `currentColor`.
- The source of truth is `components/core/iconPaths.js`. Individual SVGs and `sprite.svg` are in `assets/icons/`. In React, use `<Icon name="…" />`; in HTML, inline the SVG with class `ui-icon`.
- Icons come in two sizes only: 20px for toolbars and 16px for buttons and chips. Icons never carry meaning alone. Icon-only buttons always have `aria-label` plus a tooltip, and status icons pair with a text title.
- No emoji or icon fonts. Unicode appears only as typographic characters (×, ≈, ·, ⌘, ⇧).

## Fonts
All three families are SIL OFL 1.1 and self-hosted in `fonts/` (latin + latin-ext subsets, plus a Tamil subset):
- `"Instrument Sans"`: variable, 400–700
- `"DM Mono"`: 400, 500
- `"Noto Sans Tamil"`: variable, 400–700, Tamil subset

## Rebuilding
`Style Guide.html`, the UI kit pages and the `guidelines/` cards are generated from the tokens, `components/ui.css` and `guide/*.js`. After editing any of them, run `guide/build.js`, then `guide/build-cards.js`. See the comment at the top of each file.
