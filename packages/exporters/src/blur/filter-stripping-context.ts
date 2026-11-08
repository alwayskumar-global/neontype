/**
 * `FilterStrippingContext` — intercepts engine blur without changing `drawFrame`
 * (Req 8.1–8.4, 8.6).
 *
 * The engine's `drawFrame` paints blur by assigning `ctx.filter =
 * "blur(Npx)"` inside a per-segment `save()`/`restore()` scope (verified in
 * `packages/engine/src/draw.ts`). This wrapper is a `CanvasRenderingContext2D`-
 * shaped object that proxies a real 2D context and maintains a `save()`/
 * `restore()` state stack. When a scope's `filter` is assigned `blur(Npx)` with
 * `N > 0`, the wrapper REDIRECTS that scope's draw calls to a full-size
 * offscreen layer; on the matching `restore()` it blurs the layer with the
 * exporter's own deterministic blur (honoring the scope's `globalAlpha`) and
 * composites it onto the real context, then discards the layer. A blur-0 /
 * `none` / no-filter scope forwards every call unchanged and creates no layer.
 * The real context's `filter` is NEVER set to a browser blur.
 *
 * Interception is achieved by WRAPPING: the engine is handed this object as its
 * draw surface, so `drawFrame` is byte-for-byte unchanged. A minimal structural
 * `CanvasLike` interface is used so the wrapper is unit-testable in Node with a
 * recording fake; in the browser the layer factory builds real
 * `OffscreenCanvas` 2D contexts.
 */

import { blurImage, type RgbaImage } from "./box-blur.js";

/** The subset of `CanvasRenderingContext2D` the engine's `drawFrame` touches. */
export interface CanvasLike {
  filter: string;
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillText(text: string, x: number, y: number): void;
  // Compositing a blurred layer back onto the real context.
  drawImage(image: unknown, dx: number, dy: number): void;
}

/** A layer: an offscreen RGBA surface plus the CanvasLike that draws into it. */
export interface BlurLayer {
  ctx: CanvasLike;
  /** Reads the layer's current pixels (for blurring). */
  readImage(): RgbaImage;
  /** Produces a drawable image from a (blurred) RGBA buffer for compositing. */
  toDrawable(image: RgbaImage): unknown;
  /** Releases the layer's resources. */
  dispose(): void;
}

/** Builds a full-canvas-size blur layer. Injected so Node tests can fake it. */
export type LayerFactory = (width: number, height: number) => BlurLayer;

/** Parses `blur(Npx)`; returns `N` (>0) or `null` for `none`/other/N<=0. */
export function parseBlurFilter(filter: string): number | null {
  const m = /^blur\(\s*([0-9]*\.?[0-9]+)px\s*\)$/.exec(filter.trim());
  if (m === null) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ScopeState {
  filter: string;
  globalAlpha: number;
  /** Non-null when this scope is redirecting to a blur layer. */
  layer: BlurLayer | null;
  blurRadius: number;
}

/**
 * Wraps `real` so blur is handled by the exporter. `layerFactory` builds the
 * offscreen layer used while a blurred scope is active. Call `flush()` at the
 * end of a frame to safely composite/dispose any scope left dangling by an
 * unbalanced engine call sequence (Req 8: no leaked layer).
 */
export class FilterStrippingContext implements CanvasLike {
  private readonly real: CanvasLike;
  private readonly layerFactory: LayerFactory;
  private readonly width: number;
  private readonly height: number;
  private readonly stack: ScopeState[] = [];
  private current: ScopeState;
  /** Count of layers created minus composited/disposed; must return to 0. */
  private liveLayers = 0;

  constructor(real: CanvasLike, layerFactory: LayerFactory, width: number, height: number) {
    this.real = real;
    this.layerFactory = layerFactory;
    this.width = width;
    this.height = height;
    this.current = { filter: "none", globalAlpha: 1, layer: null, blurRadius: 0 };
  }

  /** The number of blur layers currently live (0 when balanced). For tests. */
  get liveLayerCount(): number {
    return this.liveLayers;
  }

  /** The draw target for the current scope: the blur layer, else the real ctx. */
  private target(): CanvasLike {
    return this.current.layer ? this.current.layer.ctx : this.real;
  }

  get filter(): string {
    return this.current.filter;
  }
  set filter(value: string) {
    this.current.filter = value;
    const radius = parseBlurFilter(value);
    if (radius !== null && this.current.layer === null) {
      // Enter a blurred scope: open an offscreen layer; never touch real.filter.
      this.current.layer = this.layerFactory(this.width, this.height);
      this.current.blurRadius = radius;
      this.liveLayers += 1;
      // Mirror the scope's current alpha onto the fresh layer.
      this.current.layer.ctx.globalAlpha = this.current.globalAlpha;
    }
    // The real context's filter stays "none" always.
    this.real.filter = "none";
  }

  get globalAlpha(): number {
    return this.current.globalAlpha;
  }
  set globalAlpha(value: number) {
    this.current.globalAlpha = value;
    this.target().globalAlpha = value;
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.target().fillStyle;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.target().fillStyle = value;
  }
  get font(): string {
    return this.target().font;
  }
  set font(value: string) {
    this.target().font = value;
  }
  get textAlign(): CanvasTextAlign {
    return this.target().textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    this.target().textAlign = value;
  }
  get textBaseline(): CanvasTextBaseline {
    return this.target().textBaseline;
  }
  set textBaseline(value: CanvasTextBaseline) {
    this.target().textBaseline = value;
  }

  save(): void {
    this.stack.push({ ...this.current });
    // A new scope inherits transform/alpha but NOT an active layer: the layer
    // belongs to the scope that opened it.
    this.current = {
      filter: this.current.filter,
      globalAlpha: this.current.globalAlpha,
      layer: this.current.layer,
      blurRadius: this.current.blurRadius,
    };
    this.target().save();
  }

  restore(): void {
    const openedLayerHere =
      this.current.layer !== null &&
      (this.stack.length === 0 || this.stack[this.stack.length - 1].layer !== this.current.layer);

    if (openedLayerHere && this.current.layer) {
      this.compositeLayer(this.current.layer, this.current.blurRadius, this.current.globalAlpha);
    } else {
      this.target().restore();
    }

    const prev = this.stack.pop();
    this.current = prev ?? { filter: "none", globalAlpha: 1, layer: null, blurRadius: 0 };
  }

  translate(x: number, y: number): void {
    this.target().translate(x, y);
  }
  rotate(angle: number): void {
    this.target().rotate(angle);
  }
  scale(x: number, y: number): void {
    this.target().scale(x, y);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.target().setTransform(a, b, c, d, e, f);
  }
  fillText(text: string, x: number, y: number): void {
    this.target().fillText(text, x, y);
  }
  drawImage(image: unknown, dx: number, dy: number): void {
    this.target().drawImage(image, dx, dy);
  }

  /** Blurs the layer and composites it onto the real context at the scope alpha. */
  private compositeLayer(layer: BlurLayer, radius: number, alpha: number): void {
    try {
      const blurred = blurImage(layer.readImage(), radius);
      const drawable = layer.toDrawable(blurred);
      this.real.save();
      this.real.globalAlpha = Math.min(1, Math.max(0, alpha));
      this.real.filter = "none";
      this.real.drawImage(drawable, 0, 0);
      this.real.restore();
    } finally {
      layer.dispose();
      this.liveLayers -= 1;
    }
  }

  /**
   * Safely finishes a frame: composites/disposes any layer left open by an
   * unbalanced engine call sequence so no layer leaks (Req 8: no leaked layer).
   */
  flush(): void {
    if (this.current.layer) {
      const layer = this.current.layer;
      this.current.layer = null;
      this.compositeLayer(layer, this.current.blurRadius, this.current.globalAlpha);
    }
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const scope = this.stack[i];
      if (scope.layer) {
        const layer = scope.layer;
        scope.layer = null;
        this.compositeLayer(layer, scope.blurRadius, scope.globalAlpha);
      }
    }
    this.stack.length = 0;
  }
}
