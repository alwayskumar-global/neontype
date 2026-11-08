import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visual",
  snapshotDir: "tests/visual/__snapshots__",
  webServer: {
    command: "vite tests/visual/app --port 5273",
    port: 5273,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
