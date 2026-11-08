import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the engine's seeded PRNG; no nondeterminism in frame-affecting code." },
        { object: "Date", property: "now", message: "Not allowed in exporters/src (no wall-clock in frame paths)." },
        { object: "performance", property: "now", message: "Not allowed in exporters/src (no wall-clock in frame paths)." },
      ],
      // `renderFrame` must be called in exactly one place (render-frame.ts), so
      // every path blurs + scales identically through FrameRenderer. Importing
      // it elsewhere would re-introduce a raw render path that skips the
      // FilterStrippingContext wrapper (Req 8) and the R14 scaling step.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@studio/engine",
              importNames: ["renderFrame"],
              message:
                "Do not import renderFrame outside render-frame.ts; call FrameRenderer.render so blur (Req 8) and scaling (Req 14) always apply.",
            },
          ],
        },
      ],
    },
  },
  {
    // The single sanctioned caller of the engine's renderFrame.
    files: ["src/render-frame.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
