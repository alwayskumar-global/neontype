import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the engine's golden-image visual tests (Task 12.3).
 *
 * Chromium ONLY — the steering rule pins golden images to a single engine, so
 * there is no Firefox or WebKit project. The visual Vite app is started on port
 * 5173 (matching `tests/visual/app/vite.config.ts`); `reuseExistingServer` is
 * enabled off-CI so a dev server already running is reused. Snapshots (the
 * committed golden PNGs) live under `tests/visual/__snapshots__/`.
 */
export default defineConfig({
  testDir: "tests/visual",
  snapshotDir: "tests/visual/__snapshots__",
  webServer: {
    command: "vite tests/visual/app --port 5173",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
