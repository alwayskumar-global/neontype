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
import { dispatchExport } from "../../../src/worker/dispatch.js";
import { recordingDriver } from "../../../src/worker/driver.js";
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

declare global {
  interface Window {
    runWorkerExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runMainExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runWorkerAbort: () => Promise<{ ok: boolean; code?: string }>;
  }
}

window.runWorkerExport = runWorkerExport;
window.runMainExport = runMainExport;
window.runWorkerAbort = runWorkerAbort;
