import { describe, it, expect, vi } from "vitest";
import { reduce, INITIAL } from "./machine.js";
import { prepareExportFonts, type PrepareDeps } from "./prepare.js";

const okGate = () => Promise.resolve({ ok: true as const });

describe("prepareExportFonts", () => {
  it("returns cancelled, and never starts the export, when Cancel fires during the byte load", async () => {
    let release!: (v: Awaited<ReturnType<PrepareDeps["loadBundledFontBytes"]>>) => void;
    const pending = new Promise<Awaited<ReturnType<PrepareDeps["loadBundledFontBytes"]>>>((r) => { release = r; });
    const controller = new AbortController();
    const runExport = vi.fn();
    const p = prepareExportFonts(controller.signal, { whenFontsReady: okGate, loadBundledFontBytes: () => pending });
    controller.abort(); // user clicks Cancel while bytes are loading
    release({ ok: true, fonts: [] });
    const outcome = await p;
    expect(outcome).toEqual({ kind: "cancelled" });
    if (outcome.kind === "ready") runExport();
    expect(runExport).not.toHaveBeenCalled();
    // The machine accepts "cancelled" while running.
    let s = reduce(INITIAL, { type: "open", capabilities: {} as never });
    s = reduce(s, { type: "select-format", format: "gif" });
    s = reduce(s, { type: "start" });
    expect(reduce(s, { type: "cancelled" }).status).toBe("cancelled");
  });

  it("returns cancelled when Cancel fires during the font gate", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<{ ok: true }>((r) => { release = () => r({ ok: true }); });
    const loadBytes = vi.fn();
    const p = prepareExportFonts(controller.signal, { whenFontsReady: () => gate, loadBundledFontBytes: loadBytes });
    controller.abort();
    release();
    expect(await p).toEqual({ kind: "cancelled" });
    expect(loadBytes).not.toHaveBeenCalled();
  });

  it("maps gate and byte failures to fail outcomes", async () => {
    const s = new AbortController().signal;
    const badGate = await prepareExportFonts(s, {
      whenFontsReady: () => Promise.resolve({ ok: false as const, code: "font-not-ready" as const, message: "g" }),
      loadBundledFontBytes: vi.fn(),
    });
    expect(badGate).toEqual({ kind: "fail", code: "font-not-ready", message: "g" });
    const badBytes = await prepareExportFonts(s, {
      whenFontsReady: okGate,
      loadBundledFontBytes: () => Promise.resolve({ ok: false as const, code: "font-not-ready" as const, message: "b" }),
    });
    expect(badBytes).toEqual({ kind: "fail", code: "font-not-ready", message: "b" });
  });

  it("returns the fonts when nothing is cancelled or failed", async () => {
    const fonts = [{ family: "A", weight: 400, data: new ArrayBuffer(1) }];
    const out = await prepareExportFonts(new AbortController().signal, { whenFontsReady: okGate, loadBundledFontBytes: () => Promise.resolve({ ok: true as const, fonts }) });
    expect(out).toEqual({ kind: "ready", fonts });
  });
});
