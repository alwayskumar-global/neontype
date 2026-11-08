import { describe, it, expect, vi } from "vitest";
import { whenFontsReady, BUNDLED_FAMILIES } from "./fonts.js";

/** A fake document.fonts + FontFace for Node (no real font loading). */
function fakeDoc(): Document {
  return {
    fonts: { add: () => {}, ready: Promise.resolve() },
  } as unknown as Document;
}

describe("whenFontsReady", () => {
  it("lists the two bundled families", () => {
    expect(BUNDLED_FAMILIES).toEqual(["Noto Sans", "Noto Sans Tamil"]);
  });

  it("maps a decode/load rejection to font-decode-failed", async () => {
    vi.stubGlobal("FontFace", class {
      load() { return Promise.reject(new Error("bad woff2")); }
    });
    const res = await whenFontsReady(fakeDoc(), 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("font-decode-failed");
    vi.unstubAllGlobals();
  });

  it("maps a slow load to font-not-ready within the timeout", async () => {
    vi.stubGlobal("FontFace", class {
      load() { return new Promise(() => {}); } // never resolves
    });
    const res = await whenFontsReady(fakeDoc(), 30);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("font-not-ready");
    vi.unstubAllGlobals();
  });

  it("resolves ok when all faces load", async () => {
    vi.stubGlobal("FontFace", class {
      load() { return Promise.resolve(this); }
    });
    const res = await whenFontsReady(fakeDoc(), 1000);
    expect(res.ok).toBe(true);
    vi.unstubAllGlobals();
  });
});
