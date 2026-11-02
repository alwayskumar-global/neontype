---
inclusion: fileMatch
fileMatchPattern: "packages/embed/**"
---

# Embed (`<motion-text>`)

- The component renders visually hidden real text plus an `aria-label` so screen readers get the content.
- It honors `prefers-reduced-motion` by showing the final frame instead of animating.
- It makes no network requests.
- It depends on `packages/engine` only; no studio or exporter deps.
