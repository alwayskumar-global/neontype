/**
 * Pre-export font preparation, as a pure async function so the cancel and
 * failure paths are unit-testable without a DOM. Order matters: the caller
 * creates its AbortController BEFORE calling this, so Cancel works while fonts
 * are still loading. Returns `cancelled` if the signal aborted during any await.
 */
import type { FontSource, ErrorCode } from "@studio/exporters";
import { whenFontsReady, loadBundledFontBytes, type FontStatus, type BundledFontBytes } from "../fonts/fonts.js";

export type PrepareOutcome =
  | { kind: "ready"; fonts: FontSource[] }
  | { kind: "cancelled" }
  | { kind: "fail"; code: ErrorCode; message: string };

export interface PrepareDeps {
  whenFontsReady: () => Promise<FontStatus>;
  loadBundledFontBytes: () => Promise<BundledFontBytes>;
}

export async function prepareExportFonts(
  signal: AbortSignal,
  deps: PrepareDeps = { whenFontsReady, loadBundledFontBytes },
): Promise<PrepareOutcome> {
  const gate = await deps.whenFontsReady();
  if (signal.aborted) return { kind: "cancelled" };
  if (!gate.ok) return { kind: "fail", code: gate.code, message: gate.message };
  const bytes = await deps.loadBundledFontBytes();
  if (signal.aborted) return { kind: "cancelled" };
  if (!bytes.ok) return { kind: "fail", code: bytes.code, message: bytes.message };
  return { kind: "ready", fonts: bytes.fonts };
}
