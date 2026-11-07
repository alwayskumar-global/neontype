import { defineConfig } from "vite";

/**
 * Vite config for the visual test harness page (Task 12.1).
 *
 * `root` points at this app directory so `index.html` is served at `/`, and the
 * dev server is pinned to port 5173 to match the Playwright `webServer` config.
 */
export default defineConfig({
  root: "tests/visual/app",
  server: {
    port: 5173,
  },
});
