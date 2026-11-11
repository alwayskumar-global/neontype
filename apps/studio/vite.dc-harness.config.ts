import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { injectCspOnBuild } from "./csp.js";

// Dev-only smoke harness build (Requirement 17.10). Separate root and output folder: it never
// touches dist/. The SAME strict CSP as production is injected into both pages.
export default defineConfig({
  root: "dc-harness",
  publicDir: "../public",
  plugins: [react(), injectCspOnBuild()],
  build: {
    outDir: "../dist-dc-harness",
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rollupOptions: { input: { index: "index.html", parity: "parity.html" } },
  },
});
