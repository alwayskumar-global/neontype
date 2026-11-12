import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Project } from "@studio/engine";
import { runWebpExport, WEBP_DEFAULT_QUALITY, type FrameSource, type WebpDeps } from "./webp.js";
import { exportWebp } from "../api.js";
import { buildAnimatedWebp, chunk, frameDurationsMs, parseStillWebp, WebpFormatError, type AnimFrame } from "../webp/riff.js";
import { readAnimatedWebp } from "../__tests__/helpers/webp-reader.js";
// ---- synthetic stills: structurally valid WebP files with arbitrary payload bytes ----
const enc = new TextEncoder();
const le = (n: number, bytes: number): number[] => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff);
function riff(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.byteLength);
  out.set(enc.encode("RIFF"), 0);
  out.set(le(4 + body.byteLength, 4), 4);
  out.set(enc.encode("WEBP"), 8);
  out.set(body, 12);
  return out;
}
const cat = (...p: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.byteLength, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.byteLength;
  }
  return out;
};
/** A VP8 key-frame payload of `extra` extra bytes. */
function vp8Payload(w: number, h: number, extra: number, seed: number): Uint8Array {
  const p = new Uint8Array(10 + extra);
  p.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le(w, 2), ...le(h, 2)], 0);
  for (let i = 10; i < p.length; i++) p[i] = (i * 31 + seed) & 0xff;
  return p;
}
function vp8lPayload(w: number, h: number, alpha: boolean, extra: number): Uint8Array {
  const bits = (w - 1) | ((h - 1) << 14) | ((alpha ? 1 : 0) << 28);
  const p = new Uint8Array(5 + extra);
  p.set([0x2f, ...le(bits, 4)], 0);
  return p;
}
const alphPayload = (n: number, seed: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 0xff);
type Kind = "lossy" | "lossless" | "lossy-alpha";
function still(kind: Kind, w: number, h: number, extra = 3, seed = 1): Uint8Array {
  if (kind === "lossy") return riff(chunk("VP8 ", vp8Payload(w, h, extra, seed)));
  if (kind === "lossless") return riff(chunk("VP8L", vp8lPayload(w, h, true, extra)));
  const vp8x = chunk("VP8X", Uint8Array.from([0x10, 0, 0, 0, ...le(w - 1, 3), ...le(h - 1, 3)]));
  return riff(cat(vp8x, chunk("ALPH", alphPayload(7 + extra, seed)), chunk("VP8 ", vp8Payload(w, h, extra, seed))));
}
function project(over: Partial<Project> & { fps?: number; durationSeconds?: number; width?: number; height?: number } = {}): Project {
  const { fps = 10, durationSeconds = 0.5, width = 16, height = 12, ...rest } = over;
  return {
    schemaVersion: 1,
    canvas: { width, height, fps, durationSeconds },
    background: "#101018",
    seed: 1,
    layers: [
      {
        id: "a", text: "x", tracks: [], effectInstances: [],
        fontFamily: "sans-serif", fontSize: 20, fontWeight: "bold", fill: "#ffffff",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: durationSeconds, anchor: { x: 8, y: 8 },
      },
    ],
    ...rest,
  } as Project;
}
/** Deps that stand in for the browser: a probe and a frame source that returns canned stills. */
function deps(kind: Kind, extra: { supported?: boolean; encoded?: number[] } = {}): WebpDeps {
  return {
    stillWebpSupported: async () => extra.supported ?? true,
    makeFrameSource: (p, plan): FrameSource => ({
      encode: async (i) => {
        extra.encoded?.push(i);
        return still(kind, plan.outputWidth, plan.outputHeight, 3 + (i % 4), i);
      },
    }),
  };
}
const run = (p: Project, d: WebpDeps, opts: Parameters<typeof runWebpExport>[1] = {}, abort = () => false) =>
  runWebpExport(p, opts, () => undefined, abort, d);
async function bytesOf(r: Awaited<ReturnType<typeof run>>): Promise<Uint8Array> {
  if (!r.ok) throw new Error(`export failed: ${r.error.code}`);
  return new Uint8Array(await r.file.arrayBuffer());
}
describe("frameDurationsMs", () => {
  it("spreads the rounding remainder so the sum is exact", () => {
    expect(frameDurationsMs(3, 100)).toEqual([33, 33, 34]);
    expect(frameDurationsMs(30, 1000).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(frameDurationsMs(4, 10)).toEqual([2, 3, 2, 3]);
    expect(frameDurationsMs(1, 77)).toEqual([77]);
  });
  it("rejects a bad frame count or total", () => {
    expect(() => frameDurationsMs(0, 10)).toThrow(WebpFormatError);
    expect(() => frameDurationsMs(2, 1.5)).toThrow(WebpFormatError);
  });
  // Feature: exporters, Property 15: WebP frame durations sum exactly
  it("Property 15: for any frame count and total, durations are floor or ceil of total/N and sum to total", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 600 }), fc.integer({ min: 0, max: 600_000 }), (n, total) => {
        const d = frameDurationsMs(n, total);
        expect(d).toHaveLength(n);
        expect(d.reduce((a, b) => a + b, 0)).toBe(total);
        for (const x of d) expect([Math.floor(total / n), Math.ceil(total / n)]).toContain(x);
        expect(frameDurationsMs(n, total)).toEqual(d);
      }),
      { numRuns: 300 },
    );
  });
});
describe("parseStillWebp", () => {
  it("splits a simple lossy still into its VP8 chunk and reads the size", () => {
    const s = parseStillWebp(still("lossy", 33, 17, 4));
    expect(s.kind).toBe("VP8");
    expect([s.width, s.height]).toEqual([33, 17]);
    expect(s.alph).toBeNull();
    expect(s.hasAlpha).toBe(false);
    expect(String.fromCharCode(...s.image.subarray(0, 4))).toBe("VP8 ");
    expect(s.image.byteLength % 2).toBe(0);
  });
  it("reads a lossless still (VP8L) and its alpha_is_used bit", () => {
    const s = parseStillWebp(still("lossless", 20, 9));
    expect(s.kind).toBe("VP8L");
    expect([s.width, s.height]).toEqual([20, 9]);
    expect(s.hasAlpha).toBe(true);
  });
  it("keeps the ALPH chunk of an extended lossy still, whole, and drops the wrapper", () => {
    const f = still("lossy-alpha", 16, 16, 2, 9);
    const s = parseStillWebp(f);
    expect(s.alph).not.toBeNull();
    expect(String.fromCharCode(...s.alph!.subarray(0, 4))).toBe("ALPH");
    expect(s.hasAlpha).toBe(true);
    // The chunk bytes are the same bytes as in the still.
    const hay = Array.from(f).join(",");
    expect(hay).toContain(Array.from(s.alph!).join(","));
    expect(hay).toContain(Array.from(s.image).join(","));
  });
  it("rejects a file that is not a WebP, a truncated one, and one with no image chunk", () => {
    expect(() => parseStillWebp(enc.encode("not a webp file at all, definitely"))).toThrow(WebpFormatError);
    const good = still("lossy", 8, 8);
    expect(() => parseStillWebp(good.subarray(0, 20))).toThrow(WebpFormatError);
    expect(() => parseStillWebp(riff(chunk("EXIF", new Uint8Array(8))))).toThrow(WebpFormatError);
  });
});
describe("buildAnimatedWebp container", () => {
  const frame = (w: number, h: number, ms: number, n = 4): AnimFrame => ({ data: chunk("VP8 ", vp8Payload(w, h, n, ms)), width: w, height: h, durationMs: ms });
  it("writes VP8X, ANIM, then ANMF chunks with exact fields", () => {
    const bytes = buildAnimatedWebp([frame(10, 6, 33), frame(10, 6, 34, 5)], { width: 10, height: 6, alpha: false, background: [1, 2, 3, 255] });
    const r = readAnimatedWebp(bytes);
    expect(r.topLevel).toEqual(["VP8X", "ANIM", "ANMF", "ANMF"]);
    expect(r.animation).toBe(true);
    expect(r.alpha).toBe(false);
    expect([r.canvasWidth, r.canvasHeight]).toEqual([10, 6]);
    expect(r.background).toEqual([1, 2, 3, 255]);
    expect(r.loopCount).toBe(0);
    expect(r.frames.map((f) => f.durationMs)).toEqual([33, 34]);
    for (const f of r.frames) {
      expect([f.x, f.y, f.width, f.height]).toEqual([0, 0, 10, 6]);
      expect(f.blend).toBe(false);
      expect(f.dispose).toBe(false);
      expect(f.chunks.map((c) => c.id)).toEqual(["VP8 "]);
    }
    expect(r.riffSize + 8).toBe(bytes.byteLength);
  });
  it("sets the alpha flag only when asked", () => {
    const f = [frame(4, 4, 10)];
    expect(readAnimatedWebp(buildAnimatedWebp(f, { width: 4, height: 4, alpha: true })).alpha).toBe(true);
    expect(readAnimatedWebp(buildAnimatedWebp(f, { width: 4, height: 4, alpha: false })).alpha).toBe(false);
  });
  it("stores canvas and frame sizes as 24-bit values minus one", () => {
    const w = 7680;
    const h = 4320;
    const r = readAnimatedWebp(buildAnimatedWebp([frame(w, h, 1)], { width: w, height: h, alpha: false }));
    expect([r.canvasWidth, r.canvasHeight, r.frames[0]!.width, r.frames[0]!.height]).toEqual([w, h, w, h]);
  });
  it("pads odd-sized chunks with one zero byte and excludes the pad from the size field", () => {
    const odd = chunk("ABCD", new Uint8Array(5));
    expect(odd.byteLength).toBe(8 + 5 + 1);
    expect(odd[4]).toBe(5);
    expect(odd[odd.byteLength - 1]).toBe(0);
    expect(chunk("ABCD", new Uint8Array(6)).byteLength).toBe(14);
  });
  it("rejects an empty animation, a size mismatch, and a duration or canvas that does not fit 24 bits", () => {
    const o = { width: 4, height: 4, alpha: false };
    expect(() => buildAnimatedWebp([], o)).toThrow(WebpFormatError);
    expect(() => buildAnimatedWebp([frame(5, 4, 1)], o)).toThrow(/expected 4x4/);
    expect(() => buildAnimatedWebp([frame(4, 4, 0x1000000)], o)).toThrow(/24 bits/);
    expect(() => buildAnimatedWebp([frame(4, 4, -1)], o)).toThrow(WebpFormatError);
    expect(() => buildAnimatedWebp([frame(4, 4, 1)], { width: 0x1000001, height: 4, alpha: false })).toThrow(WebpFormatError);
  });
  // Feature: exporters, Property 16: Animated WebP container parse-back
  it("Property 16: random frame counts, sizes and payload lengths parse back with exact sizes, padding, and total duration", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 96 }),
        fc.integer({ min: 1, max: 96 }),
        fc.integer({ min: 1, max: 20_000 }),
        fc.boolean(),
        fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 40, maxLength: 40 }),
        (n, w, h, totalMs, alpha, extras) => {
          const durations = frameDurationsMs(n, totalMs);
          const frames = durations.map((d, i) => frame(w, h, d, extras[i]!));
          const bytes = buildAnimatedWebp(frames, { width: w, height: h, alpha });
          const r = readAnimatedWebp(bytes); // throws on any size, padding, or ordering violation
          expect(r.frames).toHaveLength(n);
          expect(r.alpha).toBe(alpha);
          expect([r.canvasWidth, r.canvasHeight]).toEqual([w, h]);
          expect(r.frames.reduce((a, f) => a + f.durationMs, 0)).toBe(totalMs);
          expect(r.frames.map((f) => f.durationMs)).toEqual(durations);
          expect(bytes.byteLength % 2).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
describe("runWebpExport", () => {
  it("builds round(duration * fps) frames whose durations sum to duration * 1000 exactly", async () => {
    const p = project({ fps: 30, durationSeconds: 1.1 });
    const r = readAnimatedWebp(await bytesOf(await run(p, deps("lossy"))));
    expect(r.frames).toHaveLength(33);
    expect(r.frames.reduce((a, f) => a + f.durationMs, 0)).toBe(1100);
  });
  it("reports 'WebP · 1 file' facts in the summary and a webp blob", async () => {
    const res = await run(project(), deps("lossy"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.format).toBe("webp");
    expect(res.fileName).toBe("export.webp");
    expect(res.file.type).toBe("image/webp");
    expect(res.summary).toMatchObject({ width: 16, height: 12, fps: 10, frameCount: 5, notes: [] });
    expect(res.summary.byteSize).toBe(res.file.size);
  });
  it("keeps the ALPH chunk of every frame for a transparent project, with the VP8X alpha flag set", async () => {
    const p = project({ background: "transparent" });
    const r = readAnimatedWebp(await bytesOf(await run(p, deps("lossy-alpha"))));
    expect(r.alpha).toBe(true);
    expect(r.background).toEqual([0, 0, 0, 0]);
    for (const [i, f] of r.frames.entries()) {
      expect(f.chunks.map((c) => c.id), `frame ${i}`).toEqual(["ALPH", "VP8 "]);
      // The ALPH bytes are exactly the still's.
      const s = parseStillWebp(still("lossy-alpha", 16, 12, 3 + (i % 4), i));
      expect(Array.from(f.data.subarray(0, s.alph!.byteLength))).toEqual(Array.from(s.alph!));
    }
  });
  it("a lossy still with an ALPH chunk survives into the ANMF byte for byte", async () => {
    const p = project({ background: "transparent", fps: 4, durationSeconds: 0.25 });
    const bytes = await bytesOf(await run(p, deps("lossy-alpha")));
    const s = parseStillWebp(still("lossy-alpha", 16, 12, 3, 0));
    const frame = readAnimatedWebp(bytes).frames[0]!;
    expect(Array.from(frame.data)).toEqual([...s.alph!, ...s.image]);
  });
  it("a lossless still keeps its VP8L chunk (alpha lives inside it)", async () => {
    const r = readAnimatedWebp(await bytesOf(await run(project({ background: "transparent" }), deps("lossless"))));
    expect(r.alpha).toBe(true);
    for (const f of r.frames) expect(f.chunks.map((c) => c.id)).toEqual(["VP8L"]);
  });
  it("an opaque hex background clears the alpha flag, drops ALPH, and records the colour", async () => {
    const r = readAnimatedWebp(await bytesOf(await run(project({ background: "#336699" }), deps("lossy-alpha"))));
    expect(r.alpha).toBe(false);
    expect(r.background).toEqual([0x33, 0x66, 0x99, 255]);
    for (const f of r.frames) expect(f.chunks.map((c) => c.id)).toEqual(["VP8 "]);
  });
  it("returns browser-unsupported BEFORE encoding any frame when a still WebP cannot be encoded", async () => {
    const encoded: number[] = [];
    let made = 0;
    const d: WebpDeps = { stillWebpSupported: async () => false, makeFrameSource: () => { made++; return { encode: async (i) => { encoded.push(i); return still("lossy", 16, 12); } }; } };
    const r = await run(project(), d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("browser-unsupported");
    expect(encoded).toEqual([]);
    expect(made).toBe(0);
  });
  it("cancels with no file when aborted, and stops encoding", async () => {
    const encoded: number[] = [];
    let polls = 0;
    const r = await run(project({ fps: 10, durationSeconds: 1 }), deps("lossy", { encoded }), {}, () => ++polls > 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("cancelled");
    expect(encoded.length).toBe(3);
  });
  it("reports progress once per frame, ending at 1", async () => {
    const seen: number[] = [];
    await runWebpExport(project(), {}, (f) => seen.push(f), () => false, deps("lossy"));
    expect(seen).toHaveLength(5);
    expect(seen[seen.length - 1]).toBe(1);
  });
  it("fails with encoder-failure and no file when a frame is the wrong size or not a WebP", async () => {
    const wrongSize: WebpDeps = { stillWebpSupported: async () => true, makeFrameSource: () => ({ encode: async () => still("lossy", 5, 5) }) };
    const notWebp: WebpDeps = { stillWebpSupported: async () => true, makeFrameSource: () => ({ encode: async () => enc.encode("<html>") }) };
    for (const d of [wrongSize, notWebp]) {
      const r = await run(project(), d);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("encoder-failure");
    }
  });
  it("validates the project, the quality, and the limits", async () => {
    const bad = await run({ ...project(), canvas: { width: 0, height: 5, fps: 10, durationSeconds: 1 } } as Project, deps("lossy"));
    expect(!bad.ok && bad.error.code).toBe("project-invalid");
    for (const quality of [-0.1, 1.1, Number.NaN]) {
      const r = await run(project(), deps("lossy"), { quality });
      expect(!r.ok && r.error.code, String(quality)).toBe("invalid-options");
    }
    const limited = await run(project({ fps: 10, durationSeconds: 5 }), deps("lossy"), { limits: { maxFrames: 10 } });
    expect(!limited.ok && limited.error.code).toBe("invalid-options");
  });
  it("hands the quality (default 0.8) to the frame source", async () => {
    const seen: number[] = [];
    const d: WebpDeps = { stillWebpSupported: async () => true, makeFrameSource: (_p, plan, q) => { seen.push(q); return { encode: async () => still("lossy", plan.outputWidth, plan.outputHeight) }; } };
    await run(project(), d);
    await run(project(), d, { quality: 0.3 });
    expect(seen).toEqual([WEBP_DEFAULT_QUALITY, 0.3]);
    expect(WEBP_DEFAULT_QUALITY).toBe(0.8);
  });
  it("scales to the requested output size", async () => {
    const r = readAnimatedWebp(await bytesOf(await run(project({ width: 16, height: 12 }), deps("lossy"), { output: { width: 8, height: 6 } })));
    expect([r.canvasWidth, r.canvasHeight]).toEqual([8, 6]);
  });
  // Feature: exporters, Property 17: WebP export frame count and duration
  it("Property 17: for any fps and duration, frame count = round(duration*fps) and durations sum to round(duration*1000)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 20 }), async (fps, tenths) => {
        const durationSeconds = tenths / 10;
        const result = await run(project({ fps, durationSeconds, width: 8, height: 8 }), deps("lossy"));
        if (Math.round(durationSeconds * fps) === 0) {
          // Fewer than half a frame: the stepper refuses it (empty-frame-range) and no file is produced.
          expect(!result.ok && result.error.code).toBe("empty-frame-range");
          return;
        }
        const r = readAnimatedWebp(await bytesOf(result));
        expect(r.frames).toHaveLength(Math.round(durationSeconds * fps));
        expect(r.frames.reduce((a, f) => a + f.durationMs, 0)).toBe(Math.round(durationSeconds * 1000));
      }),
      { numRuns: 60 },
    );
  });
});
describe("exportWebp (public API)", () => {
  it("rejects an out-of-range quality before any export starts", async () => {
    const r = await exportWebp(project(), { quality: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid-options");
  });
});
