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
    },
  },
);
