import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use createPRNG() instead." },
        { object: "Date", property: "now", message: "Not allowed in engine/src." },
        { object: "performance", property: "now", message: "Not allowed in engine/src." },
      ],
    },
  },
);
