import { describe, it, expect } from "vitest";

import { prepareFonts, releaseFonts, fontsSupported, type FontEnv, type FontFaceLike } from "./fonts.js";
import { resolveFonts } from "../api.js";
import { MAX_FONT_BYTES, type FontSource } from "../types.js";

/** A fake FontFace whose load() behaviour is scripted per family. */
class FakeFace implements FontFaceLike {
  status = "unloaded";
  constructor(
    readonly family: string,
    readonly data: ArrayBuffer,
    readonly weight: string,
    private readonly behaviour: "ok" | "decode" | "other" | "hang",
    private readonly log: string[],
  ) {}
  load(): Promise<unknown> {
    this.log.push(`load:${this.family}`);
    if (this.behaviour === "decode") return Promise.reject(new SyntaxError("bad font"));
    if (this.behaviour === "other") return Promise.reject(new Error("network"));
    if (this.behaviour === "hang") return new Promise(() => undefined);
    this.status = "loaded";
    return Promise.resolve(this);
  }
}

function makeEnv(opts: { behaviour?: Record<string, "ok" | "decode" | "other" | "hang">; timeoutMs?: number; preset?: FakeFace[] } = {}) {
  const log: string[] = [];
  const set = new Set<FontFaceLike>(opts.preset ?? []);
  const env: FontEnv = {
    fontSet: {
      add: (f) => { log.push(`add:${f.family}`); set.add(f); },
      delete: (f) => { log.push(`delete:${f.family}`); set.delete(f); },
      forEach: (cb) => set.forEach(cb),
    },
    makeFace: (family, data, weight) => new FakeFace(family, data, weight, opts.behaviour?.[family] ?? "ok", log),
    timeoutMs: opts.timeoutMs ?? 1000,
  };
  return { env, log, set };
}

const bytes = (n = 8): ArrayBuffer => new Uint8Array(n).buffer;
const font = (family: string, weight: number | string = 400): FontSource => ({ family, weight, data: bytes() });

describe("prepareFonts", () => {
  it("loads each face before adding it", async () => {
    const { env, log } = makeEnv();
    const r = await prepareFonts([font("A"), font("B", 700)], env);
    expect(r.failure).toBeNull();
    expect(r.added).toHaveLength(2);
    expect(log).toEqual(["load:A", "add:A", "load:B", "add:B"]);
  });

  it("is a no-op when no fonts are requested", async () => {
    const { env, log } = makeEnv();
    expect(await prepareFonts(undefined, env)).toEqual({ failure: null, added: [] });
    expect(await prepareFonts([], env)).toEqual({ failure: null, added: [] });
    expect(log).toEqual([]);
  });

  it("skips an already-loaded family+weight and never releases it", async () => {
    const pre = new FakeFace("A", bytes(), "400", "ok", []);
    pre.status = "loaded";
    const { env, set } = makeEnv({ preset: [pre] });
    const r = await prepareFonts([font("A", 400), font("B")], env);
    expect(r.added.map((f) => f.family)).toEqual(["B"]);
    releaseFonts(r.added, env);
    expect(set.has(pre)).toBe(true);
    expect([...set].map((f) => f.family)).toEqual(["A"]);
  });

  it("release removes exactly the faces that were added", async () => {
    const { env, set } = makeEnv();
    const r = await prepareFonts([font("A"), font("B")], env);
    expect(set.size).toBe(2);
    releaseFonts(r.added, env);
    expect(set.size).toBe(0);
  });

  it("leaves the caller's bytes reusable across two exports", async () => {
    const data = bytes(16);
    const src: FontSource[] = [{ family: "A", weight: 400, data }];
    const a = makeEnv();
    const r1 = await prepareFonts(src, a.env);
    releaseFonts(r1.added, a.env);
    const b = makeEnv();
    const r2 = await prepareFonts(src, b.env);
    expect(r2.failure).toBeNull();
    expect(src[0].data).toBe(data);
    expect(data.byteLength).toBe(16);
  });

  it("maps a decode failure to font-decode-failed and releases partial adds", async () => {
    const { env, set } = makeEnv({ behaviour: { B: "decode" } });
    const r = await prepareFonts([font("A"), font("B")], env);
    expect(r.failure && !r.failure.ok && r.failure.error.code).toBe("font-decode-failed");
    expect(r.added).toEqual([]);
    expect(set.size).toBe(0);
  });

  it("maps any other rejection to font-not-ready", async () => {
    const { env } = makeEnv({ behaviour: { A: "other" } });
    const r = await prepareFonts([font("A")], env);
    expect(r.failure && !r.failure.ok && r.failure.error.code).toBe("font-not-ready");
  });

  it("maps a timeout to font-not-ready and releases partial adds", async () => {
    const { env, set } = makeEnv({ behaviour: { B: "hang" }, timeoutMs: 20 });
    const r = await prepareFonts([font("A"), font("B")], env);
    expect(r.failure && !r.failure.ok && r.failure.error.code).toBe("font-not-ready");
    expect(set.size).toBe(0);
  });

  it("maps an unsupported runtime to font-not-ready", async () => {
    const env: FontEnv = { fontSet: undefined, makeFace: undefined, timeoutMs: 10 };
    expect(fontsSupported(env)).toBe(false);
    const r = await prepareFonts([font("A")], env);
    expect(r.failure && !r.failure.ok && r.failure.error.code).toBe("font-not-ready");
  });
});

describe("resolveFonts", () => {
  const code = (r: unknown): string | undefined => (r as { ok?: boolean; error?: { code: string } } | undefined)?.error?.code;
  const paths = (r: unknown): string[] | undefined => (r as { error?: { fieldPaths?: string[] } }).error?.fieldPaths;

  it("returns undefined for no fonts", () => {
    expect(resolveFonts(undefined)).toBeUndefined();
    expect(resolveFonts([])).toBeUndefined();
  });

  it("passes sources through without copying", () => {
    const src = [font("A"), font("B", "bold")];
    const r = resolveFonts(src) as FontSource[];
    expect(r).toBe(src);
    expect(r[0].data).toBe(src[0].data);
  });

  it.each([
    ["empty family", [{ family: "", weight: 400, data: bytes() }], "fonts[0]"],
    ["overlong family", [{ family: "x".repeat(101), weight: 400, data: bytes() }], "fonts[0]"],
    ["bad weight", [font("A"), { family: "B", weight: "heavy", data: bytes() }], "fonts[1]"],
    ["empty data", [{ family: "A", weight: 400, data: new ArrayBuffer(0) }], "fonts[0]"],
    ["a url source", [{ family: "A", weight: 400, url: "/x.woff2" }], "fonts[0]"],
    ["a Uint8Array instead of an ArrayBuffer", [{ family: "A", weight: 400, data: new Uint8Array(4) }], "fonts[0]"],
    ["a null entry", [null], "fonts[0]"],
  ])("rejects %s with invalid-options", (_name, input, path) => {
    const r = resolveFonts(input);
    expect(code(r)).toBe("invalid-options");
    expect(paths(r)).toEqual([path]);
  });

  it("rejects a non-array with fieldPaths [fonts]", () => {
    const r = resolveFonts("nope");
    expect(code(r)).toBe("invalid-options");
    expect(paths(r)).toEqual(["fonts"]);
  });

  it("rejects over 50 MB with font-decode-failed", () => {
    const big = { family: "A", weight: 400, data: { byteLength: MAX_FONT_BYTES + 1 } };
    // A real ArrayBuffer that large is wasteful; stand in with the prototype so instanceof holds.
    Object.setPrototypeOf(big.data, ArrayBuffer.prototype);
    Object.defineProperty(big.data, "byteLength", { value: MAX_FONT_BYTES + 1 });
    const r = resolveFonts([big]);
    expect(code(r)).toBe("font-decode-failed");
    expect(paths(r)).toEqual(["fonts[0]"]);
  });
});
