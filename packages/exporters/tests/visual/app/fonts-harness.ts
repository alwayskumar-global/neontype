/**
 * Font-parity harness (Req 13.11-13.12, 15). Renders one static frame three ways
 * and compares each to the PREVIEW render (main thread, fonts registered in
 * document.fonts):
 *   - the WORKER path with `fonts` supplied,
 *   - the MAIN-THREAD path with `fonts` supplied,
 *   - the WORKER path WITHOUT `fonts` (must mismatch: it measures a fallback).
 * Diff ratio is the fraction of pixels whose RGBA differs at all (exact).
 * No global is mutated to steer a path: the main-thread run calls
 * `runOnMainThread` directly.
 */
import type { Project, FontSource } from "../../../src/types.js";
import { DEFAULT_LIMITS } from "../../../src/types.js";
import { dispatchExport, runOnMainThread } from "../../../src/worker/dispatch.js";
import { prepareFonts, releaseFonts } from "../../../src/worker/fonts.js";
import { FrameRenderer, makeOffscreenLayerFactory } from "../../../src/render-frame.js";

const W = 640;
const H = 360;

function project(): Project {
  const base = {
    tracks: [], effectInstances: [], fontWeight: "700", align: "center" as const,
    letterSpacing: 0, lineHeight: 1.2, maxWidth: null, startSeconds: 0, endSeconds: 0.1,
  };
  return {
    schemaVersion: 1,
    canvas: { width: W, height: H, fps: 10, durationSeconds: 0.1 },
    background: "#101018",
    seed: 3,
    layers: [
      { ...base, id: "title", text: "Motion Text", fontFamily: "Noto Sans", fontSize: 96, fill: "#ffcc00", anchor: { x: 320, y: 140 } },
      { ...base, id: "tamil", text: "\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd", fontFamily: "Noto Sans Tamil", fontSize: 64, fill: "#2dd3f0", anchor: { x: 320, y: 250 } },
    ],
  } as Project;
}

const FILES: { family: string; weight: number; file: string }[] = [
  { family: "Noto Sans", weight: 400, file: "noto-sans-latin-400-normal.woff2" },
  { family: "Noto Sans", weight: 700, file: "noto-sans-latin-700-normal.woff2" },
  { family: "Noto Sans Tamil", weight: 400, file: "noto-sans-tamil-tamil-400-normal.woff2" },
  { family: "Noto Sans Tamil", weight: 700, file: "noto-sans-tamil-tamil-700-normal.woff2" },
];

async function loadFonts(): Promise<FontSource[]> {
  return await Promise.all(
    FILES.map(async (f) => ({ family: f.family, weight: f.weight, data: await (await fetch(`/fonts/${f.file}`)).arrayBuffer() })),
  );
}

/** Preview: main-thread FrameRenderer with the fonts registered in document.fonts. */
async function previewBytes(fonts: FontSource[]): Promise<Uint8ClampedArray> {
  const prep = await prepareFonts(fonts);
  if (prep.failure) throw new Error("preview fonts failed");
  try {
    const plan = { canvasWidth: W, canvasHeight: H, outputWidth: W, outputHeight: H, scale: 1, needsScaling: false };
    const renderer = new FrameRenderer(plan, makeOffscreenLayerFactory());
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d")!;
    renderer.render(project(), 0, ctx);
    return ctx.getImageData(0, 0, W, H).data;
  } finally {
    releaseFonts(prep.added);
  }
}

async function exportBytes(path: "worker" | "main", fonts: FontSource[] | undefined): Promise<Uint8Array> {
  const args = { driverId: "recording", format: "png-sequence" as const, project: project(), options: { fonts }, limits: DEFAULT_LIMITS };
  const result = path === "worker" ? await dispatchExport(args) : await runOnMainThread(args);
  if (!result.ok) throw new Error(`export failed: ${result.error.code}`);
  return new Uint8Array(await result.file.arrayBuffer());
}

function diffRatio(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 1;
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) differing++;
  }
  return differing / (a.length / 4);
}

export interface FontParityResult {
  hasWorker: boolean;
  workerWithFonts: number;
  mainWithFonts: number;
  workerWithoutFonts: number;
  documentFacesAfter: number;
  callerBytesIntact: boolean;
}

declare global {
  interface Window {
    runFontParity: () => Promise<FontParityResult>;
  }
}

window.runFontParity = async () => {
  const fonts = await loadFonts();
  const sizes = fonts.map((f) => f.data.byteLength);
  const facesBefore = (() => { let n = 0; document.fonts.forEach(() => n++); return n; })();
  const preview = await previewBytes(fonts);
  const workerWith = await exportBytes("worker", fonts);
  const mainWith = await exportBytes("main", fonts);
  const workerWithout = await exportBytes("worker", undefined);
  let facesAfter = 0;
  document.fonts.forEach(() => facesAfter++);
  return {
    hasWorker: typeof Worker !== "undefined",
    workerWithFonts: diffRatio(preview, workerWith),
    mainWithFonts: diffRatio(preview, mainWith),
    workerWithoutFonts: diffRatio(preview, workerWithout),
    documentFacesAfter: facesAfter - facesBefore,
    callerBytesIntact: fonts.every((f, i) => f.data.byteLength === sizes[i]),
  };
};
