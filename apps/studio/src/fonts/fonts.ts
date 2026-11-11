/**
 * Bundled-font readiness gate (Requirement 6). The app self-hosts Noto Sans and
 * Noto Sans Tamil (weights 400 + 700, OFL-1.1); no network font request.
 *
 * Canvas `measureText`/`fillText` only use a face once it is loaded AND present
 * in `document.fonts`; `document.fonts.ready` alone does NOT guarantee the
 * CSS-declared faces are loaded (canvas use does not trigger lazy loading).
 * So the gate explicitly loads each of the four faces, adds it to
 * `document.fonts`, and verifies with `document.fonts.check(...)` for all four
 * before any measurement or paint is allowed. A late-arriving face is surfaced
 * via `onFontsLoadingDone` so canvases can drop their layout cache and repaint.
 */

/** The bundled families offered as a layer fontFamily. */
export const BUNDLED_FAMILIES = ["Noto Sans", "Noto Sans Tamil"] as const;

/** The four bundled faces (family, weight, url). Self-hosted under /fonts. */
const FACES: { family: string; weight: number; url: string }[] = [
  { family: "Noto Sans", weight: 400, url: "/fonts/noto-sans-latin-400-normal.woff2" },
  { family: "Noto Sans", weight: 700, url: "/fonts/noto-sans-latin-700-normal.woff2" },
  { family: "Noto Sans Tamil", weight: 400, url: "/fonts/noto-sans-tamil-tamil-400-normal.woff2" },
  { family: "Noto Sans Tamil", weight: 700, url: "/fonts/noto-sans-tamil-tamil-700-normal.woff2" },
];

/** A `document.fonts.check` spec per bundled face (sample text covers Tamil). */
const CHECK_SPECS: { spec: string; text: string }[] = [
  { spec: '400 16px "Noto Sans"', text: "Ag" },
  { spec: '700 16px "Noto Sans"', text: "Ag" },
  { spec: '400 16px "Noto Sans Tamil"', text: "\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd" },
  { spec: '700 16px "Noto Sans Tamil"', text: "\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd" },
];

/** Font gate outcome, mapped to the exporter error codes the UI shows. */
export type FontStatus =
  | { ok: true }
  | { ok: false; code: "font-not-ready" | "font-decode-failed"; message: string };

/** Readiness timeout (ms) before mapping to font-not-ready (Req 6.4). */
export const FONT_READY_TIMEOUT_MS = 10_000;

/** True only when all four bundled faces pass `document.fonts.check`. */
export function allFacesReady(doc: Document = document): boolean {
  if (!doc.fonts) return false;
  return CHECK_SPECS.every((c) => doc.fonts.check(c.spec, c.text));
}

/**
 * Loads the four bundled faces, adds each to `document.fonts`, and resolves ok
 * only after `document.fonts.check` passes for ALL four (so canvas measurement
 * uses the real fonts, not a fallback). A load timeout maps to `font-not-ready`;
 * a decode failure maps to `font-decode-failed`. Never throws. `doc` is
 * injectable for tests.
 */
export async function whenFontsReady(
  doc: Document = document,
  timeoutMs: number = FONT_READY_TIMEOUT_MS,
): Promise<FontStatus> {
  if (typeof FontFace === "undefined" || !doc.fonts) {
    return { ok: false, code: "font-not-ready", message: "Font loading is unavailable in this runtime." };
  }
  try {
    const faces = FACES.map((f) => new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: String(f.weight) }));
    const loadAll = Promise.all(
      faces.map((face) =>
        face.load().then((f) => {
          doc.fonts.add(f);
          return f;
        }),
      ),
    );
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
    const race = await Promise.race([loadAll.then(() => "loaded" as const), timeout]);
    if (race === "timeout") {
      return { ok: false, code: "font-not-ready", message: "Fonts did not load in time." };
    }
    // Belt-and-suspenders: also load by family/weight so check() is satisfied,
    // then verify all four faces report ready before any paint is allowed.
    await Promise.all(CHECK_SPECS.map((c) => doc.fonts.load(c.spec, c.text).catch(() => undefined)));
    await doc.fonts.ready;
    if (!allFacesReady(doc)) {
      return { ok: false, code: "font-not-ready", message: "Fonts did not become ready in time." };
    }
    return { ok: true };
  } catch {
    // A FontFace.load rejection means the woff2 failed to fetch/decode.
    return { ok: false, code: "font-decode-failed", message: "A bundled font failed to load." };
  }
}

/**
 * Subscribes to `document.fonts` `loadingdone` so a canvas can drop its layout
 * cache (by recreating its provider/renderer) and repaint if a face arrives
 * after the first paint. Returns an unsubscribe function.
 */
export function onFontsLoadingDone(cb: () => void, doc: Document = document): () => void {
  if (!doc.fonts || typeof doc.fonts.addEventListener !== "function") return () => undefined;
  const handler = (): void => cb();
  doc.fonts.addEventListener("loadingdone", handler);
  return () => doc.fonts.removeEventListener("loadingdone", handler);
}
