/**
 * Parity probe (Requirement 9), exposed on window for the Playwright parity
 * spec. Lives in the app module graph so the bundler resolves @studio/engine and
 * the exporter FrameRenderer. Compares the preview renderFrame path against the
 * exporter FrameRenderer path for a fixture at several times, composited over
 * opaque white, returning the per-time diffRatio (24/255 per channel).
 */
import type { Project } from "@studio/engine";
import { FrameRenderer, makeOffscreenLayerFactory } from "../../../../packages/exporters/src/render-frame.js";
import { makePreviewRenderer, drawPreviewFrame } from "./draw.js";

const W = 320;
const H = 180;

function fixture(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: W, height: H, fps: 30, durationSeconds: 1 },
    background: "#101018",
    seed: 5,
    layers: [
      {
        id: "a", text: "Hello", tracks: [],
        effectInstances: [
          { effectId: "blur-in", granularity: "character", params: { startDelay: 0, durationSeconds: 0.5, startBlur: 10, delayPerGroup: 0.05, easing: "easeOut" } },
        ],
        fontFamily: "Noto Sans", fontSize: 48, fontWeight: "700", fill: "#ffcc00",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 1, anchor: { x: 20, y: 110 },
      },
      {
        id: "b", text: "World", tracks: [], effectInstances: [],
        fontFamily: "Noto Sans", fontSize: 32, fontWeight: "400", fill: "#ffffff",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 1, anchor: { x: 20, y: 150 },
      },
    ],
  };
}

function compositeOverWhite(src: CanvasImageSource): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, W, H);
  cx.drawImage(src, 0, 0);
  return cx.getImageData(0, 0, W, H).data;
}

/** Returns the diffRatio (fraction of pixels differing > 24/255) per time. */
export async function runParityProbe(): Promise<number[]> {
  const project = fixture();
  const plan = { canvasWidth: W, canvasHeight: H, outputWidth: W, outputHeight: H, scale: 1, needsScaling: false };
  // Export side: an independent FrameRenderer (own provider + blur layers).
  const exporter = new FrameRenderer(plan, makeOffscreenLayerFactory());
  // Preview side: the REAL preview path (also a FrameRenderer; own provider).
  const previewRenderer = makePreviewRenderer(project);

  const prev = document.createElement("canvas");
  prev.width = W; prev.height = H;
  const pctx = prev.getContext("2d")!;

  const ratios: number[] = [];
  for (const t of [0.0, 0.25, 0.6]) {
    drawPreviewFrame(previewRenderer, pctx, project, t);

    const exp = document.createElement("canvas");
    exp.width = W; exp.height = H;
    const ectx = exp.getContext("2d")!;
    exporter.render(project, t, ectx as unknown as OffscreenCanvasRenderingContext2D);

    const a = compositeOverWhite(prev);
    const b = compositeOverWhite(exp);
    let differing = 0;
    const total = W * H;
    for (let i = 0; i < total; i++) {
      const o = i * 4;
      if (Math.abs(a[o] - b[o]) > 24 || Math.abs(a[o + 1] - b[o + 1]) > 24 || Math.abs(a[o + 2] - b[o + 2]) > 24) differing++;
    }
    ratios.push(differing / total);
  }
  return ratios;
}
