/**
 * Exporters visual harness (blur golden).
 *
 * Renders the same content two ways at a requested size: the REFERENCE uses the
 * browser's native `ctx.filter = blur(Npx)`; the EXPORTER routes the identical
 * draw calls through the FilterStrippingContext (which never sets ctx.filter)
 * and composites the exporter's own deterministic box blur. The golden spec
 * compares them by compositing each over an opaque background (see the metric
 * note in blur-golden.spec.ts).
 */

import { blurImage, type RgbaImage } from "../../../src/blur/box-blur.js";
import {
  FilterStrippingContext,
  type BlurLayer,
  type CanvasLike,
} from "../../../src/blur/filter-stripping-context.js";

/** A content description: canvas size and the glyphs/scale to draw. */
interface Scene {
  width: number;
  height: number;
  /** Font shorthand, e.g. "bold 48px sans-serif". */
  font: string;
  text: string;
  x: number;
  y: number;
}

/** The tiny legacy scene (smoke/determinism only). */
const TINY: Scene = { width: 160, height: 120, font: "bold 48px sans-serif", text: "Ab", x: 20, y: 80 };

/** A representative 640x360 scene with a large title filling ~half the width. */
const TITLE: Scene = { width: 640, height: 360, font: "bold 140px sans-serif", text: "Title", x: 40, y: 230 };

/** Result of comparing the reference and exporter renders at one radius. */
export interface BlurComparison {
  diffRatioWhite: number;
  diffRatioBlack: number;
  maxChannelDiffWhite: number;
  maxChannelDiffBlack: number;
  maxPremultAlphaDiff: number;
  alphaSumRef: number;
  alphaSumExp: number;
}

/** Draws the scene's content with the given blur radius onto a CanvasLike. */
function drawContent(ctx: CanvasLike, scene: Scene, radius: number): void {
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffcc00";
  ctx.font = scene.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.translate(scene.x, scene.y);
  ctx.fillText(scene.text, 0, 0);
  ctx.restore();
}

/** Builds a real-canvas-backed blur layer for the FilterStrippingContext. */
function makeLayer(width: number, height: number): BlurLayer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as unknown as CanvasLike;
  return {
    ctx,
    readImage(): RgbaImage {
      const real = canvas.getContext("2d")!;
      const img = real.getImageData(0, 0, width, height);
      return { data: img.data, width, height };
    },
    toDrawable(image: RgbaImage): unknown {
      const out = document.createElement("canvas");
      out.width = image.width;
      out.height = image.height;
      const octx = out.getContext("2d")!;
      octx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      return out;
    },
    dispose(): void {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** Renders the native-filter reference into a fresh offscreen canvas. */
function renderReference(scene: Scene, radius: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, scene.width, scene.height);
  drawContent(ctx as unknown as CanvasLike, scene, radius);
  ctx.filter = "none";
  return canvas;
}

/** Renders the exporter (FilterStrippingContext + box blur) into a fresh canvas. */
function renderExporter(scene: Scene, radius: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const real = canvas.getContext("2d")!;
  real.clearRect(0, 0, scene.width, scene.height);
  const wrapped = new FilterStrippingContext(
    real as unknown as CanvasLike,
    makeLayer,
    scene.width,
    scene.height,
  );
  drawContent(wrapped, scene, radius);
  wrapped.flush();
  return canvas;
}

/** Composites `src` over an opaque `bg` and returns its pixels. */
function compositeOver(src: HTMLCanvasElement, bg: string): Uint8ClampedArray {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, src.width, src.height).data;
}

/** Reads raw (uncomposited) pixels from a canvas. */
function rawPixels(src: HTMLCanvasElement): Uint8ClampedArray {
  return src.getContext("2d")!.getImageData(0, 0, src.width, src.height).data;
}

const CHANNEL_TOL = 24;

/** diffRatio + max channel diff over RGB (alpha is opaque after compositing). */
function compareComposited(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): { diffRatio: number; maxChannelDiff: number } {
  const total = a.length / 4;
  let differing = 0;
  let maxChannelDiff = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    let pixelDiffers = false;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[o + c] - b[o + c]);
      if (d > maxChannelDiff) maxChannelDiff = d;
      if (d > CHANNEL_TOL) pixelDiffers = true;
    }
    if (pixelDiffers) differing++;
  }
  return { diffRatio: differing / total, maxChannelDiff };
}

/** Max per-channel diff of premultiplied RGBA between two straight-alpha buffers. */
function maxPremultipliedDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const total = a.length / 4;
  let max = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const aa = a[o + 3] / 255;
    const ba = b[o + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[o + c] * aa - b[o + c] * ba);
      if (d > max) max = d;
    }
    const da = Math.abs(a[o + 3] - b[o + 3]);
    if (da > max) max = da;
  }
  return max;
}

/** Sum of the alpha channel over a buffer. */
function alphaSum(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i];
  return sum;
}

/** Full comparison at one radius for a scene: composited over white and black. */
function measureScene(scene: Scene, radius: number): BlurComparison {
  const refCanvas = renderReference(scene, radius);
  const expCanvas = renderExporter(scene, radius);

  const white = compareComposited(compositeOver(refCanvas, "#ffffff"), compositeOver(expCanvas, "#ffffff"));
  const black = compareComposited(compositeOver(refCanvas, "#000000"), compositeOver(expCanvas, "#000000"));

  const refRaw = rawPixels(refCanvas);
  const expRaw = rawPixels(expCanvas);

  return {
    diffRatioWhite: white.diffRatio,
    diffRatioBlack: black.diffRatio,
    maxChannelDiffWhite: white.maxChannelDiff,
    maxChannelDiffBlack: black.maxChannelDiff,
    maxPremultAlphaDiff: maxPremultipliedDiff(refRaw, expRaw),
    alphaSumRef: alphaSum(refRaw),
    alphaSumExp: alphaSum(expRaw),
  };
}

/** Byte-for-byte check that two exporter renders of the same scene/radius match. */
function exporterSceneDeterministic(scene: Scene, radius: number): boolean {
  const a = rawPixels(renderExporter(scene, radius));
  const b = rawPixels(renderExporter(scene, radius));
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Tiny-canvas smoke: render at a radius without throwing; report determinism. */
function tinySmoke(radius: number): { deterministic: boolean; threw: boolean } {
  try {
    const det = exporterSceneDeterministic(TINY, radius);
    return { deterministic: det, threw: false };
  } catch {
    return { deterministic: false, threw: true };
  }
}

/** Representative 640x360 title scene at a radius. */
function measureTitle(radius: number): BlurComparison {
  return measureScene(TITLE, radius);
}

/** Determinism of the representative title scene at a radius. */
function titleDeterministic(radius: number): boolean {
  return exporterSceneDeterministic(TITLE, radius);
}

declare global {
  interface Window {
    measureTitle: (radius: number) => BlurComparison;
    titleDeterministic: (radius: number) => boolean;
    measureScene640: (radius: number) => BlurComparison;
    tinySmoke: (radius: number) => { deterministic: boolean; threw: boolean };
    blurImage: typeof blurImage;
  }
}

window.measureTitle = measureTitle;
window.titleDeterministic = titleDeterministic;
// Small-radius fidelity cases also run on the representative 640x360 scene.
window.measureScene640 = measureTitle;
window.tinySmoke = tinySmoke;
window.blurImage = blurImage;

// Render a visible comparison once on load (tiny scene, radius 6) for manual view.
(() => {
  const ref = renderReference(TINY, 6);
  const exp = renderExporter(TINY, 6);
  const refSlot = document.getElementById("reference") as HTMLCanvasElement | null;
  const expSlot = document.getElementById("exporter") as HTMLCanvasElement | null;
  if (refSlot) refSlot.getContext("2d")!.drawImage(ref, 0, 0);
  if (expSlot) expSlot.getContext("2d")!.drawImage(exp, 0, 0);
})();


/* ----------------------- Worker-bridge parity harness ---------------------- */

import type { Project } from "../../../src/types.js";
import { renderFrame, CanvasMetricsProvider } from "@studio/engine";
import { dispatchExport } from "../../../src/worker/dispatch.js";
import { recordingDriver } from "../../../src/worker/driver.js";
import { makeOffscreenLayerFactory } from "../../../src/render-frame.js";
import { DEFAULT_LIMITS } from "../../../src/types.js";

/** A tiny valid project: a few frames, one text layer with a blur-in effect. */
function tinyProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 128, height: 72, fps: 10, durationSeconds: 0.5 },
    background: "#101018",
    seed: 7,
    layers: [
      {
        id: "title",
        text: "Hi",
        tracks: [],
        effectInstances: [
          {
            effectId: "blur-in",
            granularity: "character",
            params: { startDelay: 0, durationSeconds: 0.3, startBlur: 12, delayPerGroup: 0.05, easing: "easeOut" },
          },
        ],
        fontFamily: "sans-serif",
        fontSize: 32,
        fontWeight: "bold",
        fill: "#ffcc00",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 0.5,
        anchor: { x: 64, y: 40 },
      },
    ],
  } as Project;
}

async function blobBytes(blob: Blob): Promise<number[]> {
  const buf = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

/** Runs the recording export through the WORKER path; returns frame bytes. */
async function runWorkerExport(): Promise<{ ok: boolean; bytes: number[]; code?: string }> {
  const result = await dispatchExport({
    driverId: "recording",
    format: "png-sequence",
    project: tinyProject(),
    options: {},
    limits: DEFAULT_LIMITS,
  });
  if (result.ok) return { ok: true, bytes: await blobBytes(result.file) };
  return { ok: false, bytes: [], code: result.error.code };
}

/** Runs the recording export INLINE on the main thread; returns frame bytes. */
async function runMainExport(): Promise<{ ok: boolean; bytes: number[]; code?: string }> {
  const result = await recordingDriver(
    { format: "png-sequence", project: tinyProject(), options: {}, limits: DEFAULT_LIMITS },
    () => {},
    () => false,
  );
  if (result.ok) return { ok: true, bytes: await blobBytes(result.file) };
  return { ok: false, bytes: [], code: result.error.code };
}

/** A longer project so an abort reliably lands mid-export (worker yields per frame). */
function abortProject(): Project {
  const p = tinyProject();
  p.canvas.durationSeconds = 6; // 6s * 10fps = 60 frames, one macrotask yield each
  p.layers[0].endSeconds = 6;
  return p;
}

/** Aborts a worker export shortly after it starts; resolves with the result code. */
async function runWorkerAbort(): Promise<{ ok: boolean; code?: string }> {
  const controller = new AbortController();
  // Abort after a short delay so the worker has started but is still looping.
  setTimeout(() => controller.abort(), 20);
  const result = await dispatchExport({
    driverId: "recording",
    format: "png-sequence",
    project: abortProject(),
    options: {},
    limits: DEFAULT_LIMITS,
    signal: controller.signal,
  });
  return { ok: result.ok, code: result.ok ? undefined : result.error.code };
}

/**
 * Renders the tiny project's a mid-animation frame (t=0.15, text partly visible and still blurred)
 * WITHOUT the FilterStrippingContext: the engine paints its native
 * `ctx.filter = blur(Npx)` directly. Returns the frame bytes. Compared against
 * the wrapper path to prove the wrapper actually changes pixels where blur
 * applies (the two differ) while matching elsewhere.
 */
function renderBlurFrameNoWrapper(): number[] {
  const p = tinyProject();
  const { width, height } = p.canvas;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  const metrics = new CanvasMetricsProvider(ctx as unknown as CanvasRenderingContext2D);
  renderFrame(p, 0.15, { ctx: ctx as unknown as CanvasRenderingContext2D, metricsProvider: metrics });
  ctx.filter = "none";
  const img = ctx.getImageData(0, 0, width, height);
  return Array.from(new Uint8Array(img.data.buffer.slice(0)));
}

/**
 * Renders the same mid-animation frame THROUGH the FilterStrippingContext, over a real
 * OffscreenCanvas 2D context wrapped in a spy that records every `filter`
 * assignment. Returns the frame bytes plus whether the real context ever had
 * `filter` set to a blur value (it must not — Req 8.1-8.4).
 */
function renderBlurFrameWithWrapper(): { bytes: number[]; blurFilterSetOnReal: boolean } {
  const p = tinyProject();
  const { width, height } = p.canvas;
  const canvas = new OffscreenCanvas(width, height);
  const realCtx = canvas.getContext("2d")!;

  let blurFilterSetOnReal = false;
  const spy = new Proxy(realCtx as unknown as Record<string, unknown>, {
    set(target, prop, value): boolean {
      if (prop === "filter" && typeof value === "string" && /blur\(/.test(value)) {
        blurFilterSetOnReal = true;
      }
      (target as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
    get(target, prop): unknown {
      const v = (target as Record<string | symbol, unknown>)[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });

  const wrapped = new FilterStrippingContext(
    spy as never,
    makeOffscreenLayerFactory(),
    width,
    height,
  );
  realCtx.clearRect(0, 0, width, height);
  const metrics = new CanvasMetricsProvider(realCtx as unknown as CanvasRenderingContext2D);
  renderFrame(p, 0.15, {
    ctx: wrapped as unknown as CanvasRenderingContext2D,
    metricsProvider: metrics,
  });
  wrapped.flush();

  const img = realCtx.getImageData(0, 0, width, height);
  return {
    bytes: Array.from(new Uint8Array(img.data.buffer.slice(0))),
    blurFilterSetOnReal,
  };
}

declare global {
  interface Window {
    runWorkerExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runMainExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runWorkerAbort: () => Promise<{ ok: boolean; code?: string }>;
    renderBlurFrameNoWrapper: () => number[];
    renderBlurFrameWithWrapper: () => { bytes: number[]; blurFilterSetOnReal: boolean };
  }
}

window.runWorkerExport = runWorkerExport;
window.runMainExport = runMainExport;
window.runWorkerAbort = runWorkerAbort;
window.renderBlurFrameNoWrapper = renderBlurFrameNoWrapper;
window.renderBlurFrameWithWrapper = renderBlurFrameWithWrapper;


/* --------------------------- MP4 real-encode harness ---------------------- */

import { exportMp4, exportPngSequence, exportGif, exportWebp } from "../../../src/api.js";
import { probeStillWebpType } from "../../../src/webp/probe.js";

/** A small valid project for MP4: even 160x96, 1s at 12fps, one text layer. */
function mp4Project(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 160, height: 96, fps: 12, durationSeconds: 1 },
    background: "#101018",
    seed: 3,
    layers: [
      {
        id: "t",
        text: "Go",
        tracks: [],
        effectInstances: [
          {
            effectId: "blur-in",
            granularity: "character",
            params: { startDelay: 0, durationSeconds: 0.4, startBlur: 8, delayPerGroup: 0.05, easing: "easeOut" },
          },
        ],
        fontFamily: "sans-serif",
        fontSize: 40,
        fontWeight: "bold",
        fill: "#ffcc00",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 1,
        anchor: { x: 80, y: 60 },
      },
    ],
  } as Project;
}

/** Builds a tiny mono 16-bit PCM WAV of `seconds` at 48kHz (a 440Hz tone). */
function makeWav(seconds: number): Uint8Array {
  const sampleRate = 48000;
  const n = Math.round(seconds * sampleRate);
  const dataBytes = n * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const w4 = (o: number, s: string) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w4(0, "RIFF"); dv.setUint32(4, 36 + dataBytes, true); w4(8, "WAVE");
  w4(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w4(36, "data"); dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3;
    dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  return new Uint8Array(buf);
}

/** Audio mode for the MP4 harness: none, exact, short, long, or silent. */
type AudioMode = "none" | "exact" | "short" | "long" | "silent";

/** Runs an MP4 export (worker path via exportMp4) and returns bytes + summary. */
async function runMp4Export(mode: AudioMode): Promise<{
  ok: boolean;
  code?: string;
  bytes: number[];
  summary?: { width: number; height: number; fps: number; frameCount: number; notes: string[] };
}> {
  // Project duration is 1s; vary the WAV length to exercise pad/trim.
  const opts: Parameters<typeof exportMp4>[1] = {};
  if (mode === "exact") opts.audio = { bytes: makeWav(1) };
  else if (mode === "short") opts.audio = { bytes: makeWav(0.5) };
  else if (mode === "long") opts.audio = { bytes: makeWav(2) };
  else if (mode === "silent") opts.addSilentTrack = true;

  const result = await exportMp4(mp4Project(), opts);
  if (!result.ok) return { ok: false, code: result.error.code, bytes: [] };
  const buf = await result.file.arrayBuffer();
  return {
    ok: true,
    bytes: Array.from(new Uint8Array(buf)),
    summary: {
      width: result.summary.width,
      height: result.summary.height,
      fps: result.summary.fps,
      frameCount: result.summary.frameCount,
      notes: result.summary.notes,
    },
  };
}

/**
 * Runs an audio MP4 export with `AudioEncoder.isConfigSupported` temporarily
 * stubbed to report AAC UNSUPPORTED, to prove the main-thread capability gate
 * returns browser-unsupported (never ok-without-audio). Restores the original.
 */
async function runMp4AudioUnsupported(): Promise<{ ok: boolean; code?: string }> {
  const AE = (globalThis as { AudioEncoder?: { isConfigSupported?: unknown } }).AudioEncoder;
  const original = AE?.isConfigSupported;
  if (AE) {
    AE.isConfigSupported = async () => ({ supported: false, config: {} });
  }
  try {
    const result = await exportMp4(mp4Project(), { audio: { bytes: makeWav(1) } });
    return { ok: result.ok, code: result.ok ? undefined : result.error.code };
  } finally {
    if (AE && original) AE.isConfigSupported = original;
  }
}

declare global {
  interface Window {
    runMp4Export: (mode: "none" | "exact" | "short" | "long" | "silent") => Promise<{
      ok: boolean;
      code?: string;
      bytes: number[];
      summary?: { width: number; height: number; fps: number; frameCount: number; notes: string[] };
    }>;
    runMp4AudioUnsupported: () => Promise<{ ok: boolean; code?: string }>;
  }
}

window.runMp4Export = runMp4Export;
window.runMp4AudioUnsupported = runMp4AudioUnsupported;


/* --------------------------- PNG sequence harness ------------------------- */

/** A tiny project for the PNG sequence: 48x32, 0.3s at 10fps -> 3 frames. */
function pngProject(background: string): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 48, height: 32, fps: 10, durationSeconds: 0.3 },
    background,
    seed: 2,
    layers: [
      {
        id: "p",
        text: "x",
        tracks: [],
        effectInstances: [],
        fontFamily: "sans-serif",
        fontSize: 20,
        fontWeight: "bold",
        fill: "#ffffff",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 0.3,
        anchor: { x: 24, y: 24 },
      },
    ],
  } as Project;
}

/** Runs a PNG sequence export through the worker; returns ZIP bytes + summary. */
async function runPngExport(background: string): Promise<{
  ok: boolean;
  code?: string;
  bytes: number[];
  frameCount?: number;
}> {
  const result = await exportPngSequence(pngProject(background));
  if (!result.ok) return { ok: false, code: result.error.code, bytes: [] };
  const buf = await result.file.arrayBuffer();
  return { ok: true, bytes: Array.from(new Uint8Array(buf)), frameCount: result.summary.frameCount };
}

declare global {
  interface Window {
    runPngExport: (background: string) => Promise<{
      ok: boolean;
      code?: string;
      bytes: number[];
      frameCount?: number;
    }>;
  }
}

window.runPngExport = runPngExport;


/* ------------------------------- GIF harness ----------------------------- */

/** A tiny project for GIF: 32x24, 0.4s at 10fps -> 4 frames. */
function gifHarnessProject(background: string): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 32, height: 24, fps: 10, durationSeconds: 0.4 },
    background,
    seed: 4,
    layers: [
      {
        id: "g", text: "o", tracks: [], effectInstances: [],
        fontFamily: "sans-serif", fontSize: 16, fontWeight: "bold", fill: "#ffcc00",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 0.4, anchor: { x: 16, y: 18 },
      },
    ],
  } as Project;
}

/** Runs a GIF export through the worker; returns bytes + summary. */
async function runGifExportHarness(background: string): Promise<{
  ok: boolean;
  code?: string;
  bytes: number[];
  frameCount?: number;
}> {
  const result = await exportGif(gifHarnessProject(background));
  if (!result.ok) return { ok: false, code: result.error.code, bytes: [] };
  const buf = await result.file.arrayBuffer();
  return { ok: true, bytes: Array.from(new Uint8Array(buf)), frameCount: result.summary.frameCount };
}

declare global {
  interface Window {
    runGifExport: (background: string) => Promise<{
      ok: boolean; code?: string; bytes: number[]; frameCount?: number;
    }>;
  }
}

window.runGifExport = runGifExportHarness;

// ---- Animated WebP (task 7.1): export through the worker, then decode with the browser ----
/** The Blob type a still image/webp encode produces here (the capability probe). */
async function webpProbeHarness(): Promise<string> {
  return (await probeStillWebpType()) ?? "";
}
async function runWebpExportHarness(background: string): Promise<{ ok: boolean; code?: string; bytes: number[]; frameCount?: number }> {
  const result = await exportWebp(gifHarnessProject(background));
  if (!result.ok) return { ok: false, code: result.error.code, bytes: [] };
  const buf = await result.file.arrayBuffer();
  return { ok: true, bytes: Array.from(new Uint8Array(buf)), frameCount: result.summary.frameCount };
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } };
  decode(opts: { frameIndex: number }): Promise<{ image: VideoFrame }>;
}
/** Decodes an animated WebP; returns the frame count and each frame's corner pixel (RGBA). */
async function decodeWebpHarness(bytes: number[]): Promise<{ viaImageDecoder: boolean; frameCount: number; corners: number[][] }> {
  const data = Uint8Array.from(bytes);
  const corner = (source: CanvasImageSource, w: number, h: number): number[] => {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0);
    return Array.from(ctx.getImageData(1, 1, 1, 1).data);
  };
  const Decoder = (globalThis as unknown as { ImageDecoder?: new (init: { data: Uint8Array; type: string }) => ImageDecoderLike }).ImageDecoder;
  if (Decoder) {
    const dec = new Decoder({ data, type: "image/webp" });
    await dec.tracks.ready;
    const frameCount = dec.tracks.selectedTrack.frameCount;
    const corners: number[][] = [];
    for (let i = 0; i < frameCount; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      corners.push(corner(image, image.displayWidth, image.displayHeight));
      image.close();
    }
    return { viaImageDecoder: true, frameCount, corners };
  }
  // Fallback: a bitmap decode shows only the first frame.
  const bmp = await createImageBitmap(new Blob([data], { type: "image/webp" }));
  return { viaImageDecoder: false, frameCount: 1, corners: [corner(bmp, bmp.width, bmp.height)] };
}
declare global {
  interface Window {
    webpProbe: () => Promise<string>;
    runWebpExport: (background: string) => Promise<{ ok: boolean; code?: string; bytes: number[]; frameCount?: number }>;
    decodeWebp: (bytes: number[]) => Promise<{ viaImageDecoder: boolean; frameCount: number; corners: number[][] }>;
  }
}
window.webpProbe = webpProbeHarness;
window.runWebpExport = runWebpExportHarness;
window.decodeWebp = decodeWebpHarness;
import "./fonts-harness.js";
