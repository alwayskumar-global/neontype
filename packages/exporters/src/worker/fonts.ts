/**
 * Font registration shared by the Worker and main-thread export paths (Req 15).
 *
 * A Worker's `self.fonts` is a separate FontFaceSet that never receives the
 * host page's faces, so text measured/painted in a Worker falls back to a system
 * font. The caller therefore hands the exporter raw font bytes and this module
 * decodes each with `FontFace`, loads it, and adds it to the global font set
 * BEFORE the first measurement or frame.
 *
 * Placement (design): the Worker calls `prepareFonts` in `worker-entry.ts` and
 * never releases (the worker is terminated); the main-thread path calls it in
 * `runOnMainThread` and releases in a `finally`, because only that path shares
 * `document.fonts` with the page. The driver does not know which path it is on.
 *
 * Never throws. Mutates no global other than adding/removing the exact faces it
 * created. Uses no clock except the `setTimeout` guard for the load timeout.
 */

import type { ExportResult, FontSource } from "../types.js";
import { fail } from "../errors.js";

/** Readiness timeout for font loading (Req 1.7). */
export const FONT_LOAD_TIMEOUT_MS = 30_000;

/** The subset of `FontFace` this module uses (injectable for tests). */
export interface FontFaceLike {
  family: string;
  weight: string;
  status: string;
  load(): Promise<unknown>;
}

/** The subset of `FontFaceSet` this module uses (injectable for tests). */
export interface FontSetLike {
  add(face: FontFaceLike): unknown;
  delete(face: FontFaceLike): unknown;
  forEach(cb: (face: FontFaceLike) => void): void;
}

/** Everything font registration needs from the runtime. */
export interface FontEnv {
  fontSet: FontSetLike | undefined;
  makeFace: ((family: string, data: ArrayBuffer, weight: string) => FontFaceLike) | undefined;
  timeoutMs: number;
}

/** The real environment: `globalThis.fonts` (Worker) or `document.fonts`. */
export function defaultFontEnv(): FontEnv {
  const g = globalThis as unknown as {
    fonts?: FontSetLike;
    document?: { fonts?: FontSetLike };
    FontFace?: new (family: string, source: ArrayBuffer, descriptors: { weight: string }) => FontFaceLike;
  };
  const Ctor = g.FontFace;
  return {
    fontSet: g.fonts ?? g.document?.fonts,
    makeFace: Ctor ? (family, data, weight) => new Ctor(family, data, { weight }) : undefined,
    timeoutMs: FONT_LOAD_TIMEOUT_MS,
  };
}

/** True when the runtime can register fonts (FontFace constructor + a font set). */
export function fontsSupported(env: FontEnv = defaultFontEnv()): boolean {
  return env.fontSet !== undefined && env.makeFace !== undefined;
}

/** Result of `prepareFonts`: a failure (or null) and the faces this call added. */
export interface PreparedFonts {
  failure: ExportResult | null;
  added: FontFaceLike[];
}

/** Removes exactly the faces in `added` from the font set. Never throws. */
export function releaseFonts(added: FontFaceLike[], env: FontEnv = defaultFontEnv()): void {
  if (!env.fontSet) return;
  for (const face of added) {
    try {
      env.fontSet.delete(face);
    } catch {
      // Removal is best-effort cleanup; nothing to report.
    }
  }
}

/** True when a loaded face with this family and weight is already registered. */
function alreadyLoaded(env: FontEnv, family: string, weight: string): boolean {
  let found = false;
  env.fontSet?.forEach((f) => {
    if (f.family.replace(/^["\x27]|["\x27]$/g, "") === family && String(f.weight) === weight && f.status === "loaded") {
      found = true;
    }
  });
  return found;
}

/**
 * Loads and registers `fonts`. Skips a family+weight that is already loaded
 * (never re-added, never released). On any failure, releases the faces added so
 * far and returns `added: []`. Decode failure (`SyntaxError`) maps to
 * `font-decode-failed`; any other rejection, a timeout, or an unsupported
 * runtime maps to `font-not-ready`.
 */
export async function prepareFonts(
  fonts: FontSource[] | undefined,
  env: FontEnv = defaultFontEnv(),
): Promise<PreparedFonts> {
  if (!fonts || fonts.length === 0) return { failure: null, added: [] };
  if (!env.fontSet || !env.makeFace) {
    return { failure: fail("font-not-ready", "Font loading is unavailable in this runtime."), added: [] };
  }

  const added: FontFaceLike[] = [];
  const bail = (failure: ExportResult): PreparedFonts => {
    releaseFonts(added, env);
    return { failure, added: [] };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), env.timeoutMs);
  });

  // Set once the race is lost, so a late load never adds a face after cleanup.
  let abandoned = false;

  const registerAll = async (): Promise<ExportResult | null> => {
    for (const font of fonts) {
      const weight = String(font.weight);
      if (alreadyLoaded(env, font.family, weight)) continue;
      try {
        const face = env.makeFace!(font.family, font.data, weight);
        await face.load();
        if (abandoned) return null;
        env.fontSet!.add(face);
        added.push(face);
      } catch (err) {
        if (err instanceof SyntaxError) {
          return fail("font-decode-failed", "A supplied font failed to decode.");
        }
        return fail("font-not-ready", "A supplied font did not become ready.");
      }
    }
    return null;
  };

  try {
    const outcome = await Promise.race([registerAll(), timeout]);
    if (outcome === "timeout") {
      abandoned = true;
      return bail(fail("font-not-ready", "Fonts did not load within 30 seconds."));
    }
    if (outcome !== null) return bail(outcome);
    return { failure: null, added };
  } catch {
    return bail(fail("font-not-ready", "Fonts could not be prepared."));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
