import { defineConfig } from "vitest/config";

// Model/unit tests run in Node (the model layer is pure, DOM-free). Browser
// behaviour is covered by Playwright specs under tests/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
