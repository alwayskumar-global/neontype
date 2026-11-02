---
inclusion: always
---

# Design

- The product UI is designed externally by the owner. Exported HTML reference files live in `/design` (one folder per screen or flow).

- Treat `/design` as the visual source of truth. Rebuild each screen as React components in `apps/studio`. Never ship the exported HTML directly, never copy its inline scripts, and keep all rendering logic in `packages/engine`.

- Before implementing a screen, extract its design tokens (colors, type scale, spacing, radii, shadows) into a single tokens file in `apps/studio` and reference those everywhere. No hard-coded values in components.

- Do not add dependencies, fonts, or assets from CDNs. Fonts must be OFL and self-hosted. Bundle any images locally.

- If a design conflicts with a steering constraint (accessibility, no third-party requests), flag it and ask. Do not silently deviate.

- When the design and the implementation diverge, list the differences instead of redesigning.
