/**
 * Bundled-font readiness gate (Requirement 6). The app self-hosts Noto Sans and
 * Noto Sans Tamil (weights 400 + 700, OFL-1.1); no network font request. The
 * gate loads each FontFace, awaits readiness, and maps failures to the exporter
 * error vocabulary the UI surfaces.
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

/** Font gate outcome, mapped to the exporter error codes the UI shows. */
export type FontStatus =
  | { ok: true }
  | { ok: false; code: "font-not-ready" | "font-decode-failed"; message: string };

/** Readiness timeout (ms) before mapping to font-not-ready (Req 6.4). */
export const FONT_READY_TIMEOUT_MS = 10_000;

/**
 * Loads the bundled faces and awaits readiness. A load timeout maps to
 * `font-not-ready`; a decode failure maps to `font-decode-failed`. Never throws.
 * `doc` is injectable for tests.
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
    const loaded = faces.map((face) =>
      face.load().then((f) => {
        doc.fonts.add(f);
        return f;
      }),
    );
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
    const race = await Promise.race([Promise.all(loaded).then(() => "loaded" as const), timeout]);
    if (race === "timeout") {
      return { ok: false, code: "font-not-ready", message: "Fonts did not load in time." };
    }
    await doc.fonts.ready;
    return { ok: true };
  } catch {
    // A FontFace.load rejection means the woff2 failed to fetch/decode.
    return { ok: false, code: "font-decode-failed", message: "A bundled font failed to load." };
  }
}
