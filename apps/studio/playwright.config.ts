import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  webServer: {
    command: "vite --port 5273",
    port: 5273,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
