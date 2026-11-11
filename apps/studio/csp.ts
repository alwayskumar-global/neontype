/**
 * The strict CSP shared by every Vite build of the studio (the app and the dc-harness), so the
 * smoke harness is checked under exactly the policy production ships. Injected into the BUILT
 * html only (the Vite dev server runs with no CSP meta, since HMR needs inline/eval); vercel.json
 * serves the identical string as an HTTP header in production.
 *
 * `frame-ancestors` is intentionally omitted: browsers ignore it in a <meta> CSP (header-only
 * directive). vercel.json delivers it as an HTTP header, where clickjacking protection applies.
 */
import type { Plugin } from "vite";

export const STRICT_CSP_META =
  "default-src 'none'; script-src 'self'; style-src 'self'; " +
  "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; " +
  "connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; " +
  "form-action 'none'";

/** Build-only: inject the strict CSP <meta> into every emitted html page. */
export function injectCspOnBuild(): Plugin {
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
