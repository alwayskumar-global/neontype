/**
 * Shared export frame rendering (Req 8, Req 14).
 *
 * The ONE place every export path turns a `(project, t)` into painted pixels:
 * the worker path, the main-thread fallback, the recording driver, and every
 * format driver call this so blur and scaling behave identically everywhere
 * (Req 9.7, 9.8). It:
 *
 *   1. Renders at the PROJECT CANVAS size through a `FilterStrippingContext`, so
 *      the engine's `ctx.filter = "blur(Npx)"` is intercepted and painted by the
 *      exporter's own deterministic blur — the real context's `filter` is never
 *      set to a browser blur (Req 8.1-8.4, 8.6).
 *   2. When the requested output size differs, resamples the canvas-size frame
 *      onto the output with a SINGLE uniform scale factor, no bars (Req 14).
 *
 * DOM-free: blur layers and the canvas-size intermediate are `OffscreenCanvas`,
 * so this runs unchanged on a worker. No wall-clock is read.
 */

import {
  renderFrame,
  CanvasMetricsProvider,
  type Project,
  type TextMetricsProvider,
} from "@studio/engine";

import {
  FilterStrippingContext,
  type BlurLayer,
  type CanvasLike,
  type LayerFactory,
} from "./blur/filter-stripping-context.js";
import type { RgbaImage } from "./blur/box-blur.js";
import type { ScalePlan } from "./scale.js";

/** The 2D context this module paints onto (OffscreenCanvas-backed). */
export type ExportContext2D = OffscreenCanvasRenderingContext2D;

/** Builds an `OffscreenCanvas`-backed blur layer factory (worker-safe). */
export function makeOffscreenLayerFactory(): LayerFactory {
  return (width: number, height: number): BlurLayer => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    return {
      ctx: ctx as unknown as CanvasLike,
      readImage(): RgbaImage {
        const img = ctx.getImageData(0, 0, width, height);
        return { data: img.data, width, height };
      },
      toDrawable(image: RgbaImage): unknown {
        const out = new OffscreenCanvas(image.width, image.height);
        const octx = out.getContext("2d")!;
        // Build an ImageData from a fresh ArrayBuffer-backed copy (the source
        // Uint8ClampedArray may be typed over an ArrayBufferLike).
        const copy = new Uint8ClampedArray(image.data);
        octx.putImageData(new ImageData(copy, image.width, image.height), 0, 0);
        return out;
      },
      dispose(): void {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  };
}

/**
 * A per-export frame renderer. Created once per export so the canvas-size
 * intermediate and the layer factory are reused across frames. `render` paints
 * `project` at time `t` onto `destCtx` (sized to the output), applying blur via
 * the FilterStrippingContext and the R14 uniform scale when sizes differ.
 */
export class FrameRenderer {
  private readonly plan: ScalePlan;
  private readonly layerFactory: LayerFactory;
  /** Canvas-size surface the engine paints into (before any scale). */
  private readonly stage: OffscreenCanvas;
  private readonly stageCtx: ExportContext2D;
  /**
   * One metrics provider per export (Req 1.5), built over the REAL stage
   * context (which has `measureText`). It is passed explicitly to `renderFrame`
   * because the `FilterStrippingContext` wrapper is a draw-only surface and does
   * not implement `measureText`.
   */
  private readonly metricsProvider: TextMetricsProvider;
  /**
   * One layout memo per export, shared by every frame (Req 1.5). Layout is pure
   * in (text, font, align, ...), so frames reuse geometry instead of re-measuring.
   */
  private readonly layoutCache: NonNullable<Parameters<typeof renderFrame>[2]>["layoutCache"] = new Map();

  constructor(plan: ScalePlan, layerFactory: LayerFactory = makeOffscreenLayerFactory()) {
    this.plan = plan;
    this.layerFactory = layerFactory;
    this.stage = new OffscreenCanvas(plan.canvasWidth, plan.canvasHeight);
    this.stageCtx = this.stage.getContext("2d")!;
    this.metricsProvider = new CanvasMetricsProvider(
      this.stageCtx as unknown as CanvasRenderingContext2D,
    );
  }

  /**
   * Renders one frame onto `destCtx`. The engine paints at canvas size through
   * the FilterStrippingContext (blur intercepted); when `needsScaling`, the
   * canvas-size stage is resampled onto `destCtx` with one uniform drawImage.
   */
  render(project: Project, t: number, destCtx: ExportContext2D): void {
    const { canvasWidth: cw, canvasHeight: ch, outputWidth: ow, outputHeight: oh } = this.plan;

    this.stageCtx.clearRect(0, 0, cw, ch);
    const wrapped = new FilterStrippingContext(
      this.stageCtx as unknown as CanvasLike,
      this.layerFactory,
      cw,
      ch,
    );
    renderFrame(project, t, {
      ctx: wrapped as unknown as CanvasRenderingContext2D,
      metricsProvider: this.metricsProvider,
      layoutCache: this.layoutCache,
    });
    wrapped.flush();

    destCtx.clearRect(0, 0, ow, oh);
    if (this.plan.needsScaling) {
      // Single uniform resample onto the output (Req 14): no crop, no bars.
      destCtx.drawImage(this.stage, 0, 0, cw, ch, 0, 0, ow, oh);
    } else {
      destCtx.drawImage(this.stage, 0, 0);
    }
  }
}
