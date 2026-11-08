import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The exact strict CSP from design.md. Injected into the BUILT index.html only
// (the Vite dev server runs with no CSP meta, since HMR needs inline/eval).
// vercel.json serves the identical string as an HTTP header in production.
// NOTE: `frame-ancestors` is intentionally omitted here — browsers ignore it in
// a <meta> CSP (header-only directive). vercel.json delivers it as an HTTP
// header in production, which is where clickjacking protection applies.
const STRICT_CSP_META =
  "default-src 'none'; script-src 'self'; style-src 'self'; " +
  "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; " +
  "connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; " +
  "form-action 'none'";

/** Build-only: inject the strict CSP <meta> into the emitted index.html. */
function injectCspOnBuild(): Plugin {
  return {
    name: "inject-strict-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${STRICT_CSP_META}" />`,
      );
    },
  };
}

// Static, client-only build. The app is served from its own root; the repo-root
// `design/` directory is outside this root and is never part of the build graph.
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
