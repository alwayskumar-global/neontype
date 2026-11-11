import { describe, it, expect, vi, afterEach } from "vitest";
import { whenFontsReady, BUNDLED_FAMILIES, BUNDLED_FACES, loadBundledFontBytes, resetBundledFontBytesForTests } from "./fonts.js";

/** A fake document.fonts for Node (no real font loading). */
function fakeDoc(opts: { check?: () => boolean } = {}): { doc: Document; add: ReturnType<typeof vi.fn> } {
  const add = vi.fn();
  const doc = {
    fonts: {
      add,
      ready: Promise.resolve(),
      check: opts.check ?? (() => true),
      load: () => Promise.resolve([]),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  } as unknown as Document;
  return { doc, add };
}

const okFace = class { load() { return Promise.resolve(this); } };

afterEach(() => {
  vi.unstubAllGlobals();
  resetBundledFontBytesForTests();
});

describe("whenFontsReady", () => {
  it("lists the two bundled families", () => {
    expect(BUNDLED_FAMILIES).toEqual(["Noto Sans", "Noto Sans Tamil"]);
  });

  it("maps a decode/load rejection to font-decode-failed", async () => {
    vi.stubGlobal("FontFace", class { load() { return Promise.reject(new Error("bad woff2")); } });
    const res = await whenFontsReady(fakeDoc().doc, 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("font-decode-failed");
  });

  it("maps a slow load to font-not-ready within the timeout", async () => {
    vi.stubGlobal("FontFace", class { load() { return new Promise(() => {}); } });
    const res = await whenFontsReady(fakeDoc().doc, 30);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("font-not-ready");
  });

  it("resolves ok when all faces load and check passes", async () => {
    vi.stubGlobal("FontFace", okFace);
    const res = await whenFontsReady(fakeDoc().doc, 1000);
    expect(res.ok).toBe(true);
  });

  it("maps check() returning false to font-not-ready", async () => {
    vi.stubGlobal("FontFace", okFace);
    const res = await whenFontsReady(fakeDoc({ check: () => false }).doc, 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("font-not-ready");
  });

  it("is memoized per document: four faces added in total across calls", async () => {
    vi.stubGlobal("FontFace", okFace);
    const { doc, add } = fakeDoc();
    await whenFontsReady(doc, 1000);
    await whenFontsReady(doc, 1000);
    expect(add).toHaveBeenCalledTimes(4);
  });

  it("evicts a failed gate so a retry can succeed", async () => {
    const { doc } = fakeDoc();
    vi.stubGlobal("FontFace", class { load() { return Promise.reject(new Error("x")); } });
    expect((await whenFontsReady(doc, 1000)).ok).toBe(false);
    vi.stubGlobal("FontFace", okFace);
    expect((await whenFontsReady(doc, 1000)).ok).toBe(true);
  });
});

describe("loadBundledFontBytes", () => {
  const makeFetch = () =>
    vi.fn(async (url: string | URL | Request) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer,
    }) as unknown as Response) as unknown as typeof fetch;

  it("returns the four fonts' bytes in order", async () => {
    const res = await loadBundledFontBytes(makeFetch());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fonts.map((f) => [f.family, f.weight])).toEqual(BUNDLED_FACES.map((f) => [f.family, f.weight]));
    expect(new TextDecoder().decode(res.fonts[0].data)).toBe(BUNDLED_FACES[0].url);
  });

  it("fetches once and returns the same object", async () => {
    const f = makeFetch();
    const a = await loadBundledFontBytes(f);
    const b = await loadBundledFontBytes(f);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("maps a failed fetch to font-not-ready, then evicts and refetches", async () => {
    const bad = vi.fn(async () => ({ ok: false }) as unknown as Response) as unknown as typeof fetch;
    const first = await loadBundledFontBytes(bad);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.code).toBe("font-not-ready");
    const good = makeFetch();
    const second = await loadBundledFontBytes(good);
    expect(second.ok).toBe(true);
    expect(good).toHaveBeenCalledTimes(4);
  });
});
