import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests-csp",
  webServer: {
    command: "vite preview --port 5274",
    port: 5274,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5274" } }],
});
