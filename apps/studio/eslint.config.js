import tseslint from "typescript-eslint";

const bannedProps = [
  { object: "Math", property: "random", message: "No nondeterminism in studio src; randomness comes from the engine's seeded PRNG." },
  { object: "Date", property: "now", message: "No wall-clock outside src/playback; the playback clock is the only clock." },
  { object: "performance", property: "now", message: "No wall-clock outside src/playback; the playback clock is the only clock." },
];

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      // Determinism: no wall-clock / randomness anywhere in src ...
      "no-restricted-properties": ["error", ...bannedProps],
      // ... and never import the design reference (visual-only; not bundled).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/design/**", "**/support.js", "**/support"],
              message: "design/ is a visual reference only; never import it.",
            },
          ],
        },
      ],
    },
  },
  {
    // CSP guard (Requirement 11.2): no style attribute / prop and no raw HTML sink in JSX.
    // Dynamic geometry goes through ui/cssvars.ts (CSSOM custom properties). Core rule only;
    // no eslint-plugin-react (no new dependency).
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='style']", message: "No style attribute; use CSS classes or ui/cssvars.ts setCssVars (CSP)." },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "No raw HTML sink; render user text as React text nodes." },
      ],
    },
  },
  {
    // The playback module is the ONLY place allowed to read the animation clock.
    files: ["src/playback/**/*.ts", "src/playback/**/*.tsx"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
);
