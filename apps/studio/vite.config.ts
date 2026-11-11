import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { injectCspOnBuild } from "./csp.js";

// Static, client-only build. The app is served from its own root; the repo-root
// `design/` directory is outside this root and is never part of the build graph.
// The strict CSP lives in ./csp.ts so the dc-harness build uses the identical policy.
export default defineConfig({
  root: ".",
  plugins: [react(), injectCspOnBuild()],
  build: {
    outDir: "dist",
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  server: { port: 5273 },
});
