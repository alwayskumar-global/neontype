import { defineConfig, devices } from "@playwright/test";

// Builds the dc-harness (both pages) and serves the build with `vite preview`, so the specs run
// against built output under the strict CSP, exactly as the csp config does for the app.
export default defineConfig({
  testDir: "tests-dc",
  webServer: {
    command: "vite build --config vite.dc-harness.config.ts && vite preview --config vite.dc-harness.config.ts --outDir ../dist-dc-harness --port 5276",
    port: 5276,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5276" } }],
});
