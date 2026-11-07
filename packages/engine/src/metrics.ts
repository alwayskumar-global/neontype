/**
 * Text measurement abstraction.
 *
 * `renderFrame` and `computeFrameState` must stay pure and runnable in Node,
 * where `CanvasRenderingContext2D.measureText` is unavailable. Measurement is
 * therefore injected via the `TextMetricsProvider` interface:
 *
 * - `FakeMetricsProvider` is a deterministic, DOM-free approximation used in
 *   all fast-check and unit tests so `computeFrameState` can run headlessly.
 * - `CanvasMetricsProvider` is backed by a real 2D context and is used only in
 *   browser contexts (preview and Chromium golden-image tests).
 */

/**
 * The font parameters needed to measure a run of text. Mirrors the
 * `FontSpec` shape in the engine `FrameState` design.
 */
export interface FontSpec {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  letterSpacing: number;
}

/** Measures text geometry for a given font specification. */
export interface TextMetricsProvider {
  measure(
    text: string,
    fontSpec: FontSpec,
  ): { width: number; ascent: number; descent: number };
}

/**
 * Deterministic, DOM-free metrics used in Node tests.
 *
 * It approximates a monospace-ish advance so results are fully reproducible:
 * `width = text.length * fontSize * 0.6`, `ascent = fontSize * 0.8`, and
 * `descent = fontSize * 0.2`. It performs no DOM access and no non-deterministic
 * calls. Exported as a singleton object so callers invoke `FakeMetricsProvider.measure(...)`
 * directly without instantiation.
 */
export const FakeMetricsProvider: TextMetricsProvider = {
  measure(
    text: string,
    fontSpec: FontSpec,
  ): { width: number; ascent: number; descent: number } {
    return {
      width: text.length * fontSpec.fontSize * 0.6,
      ascent: fontSpec.fontSize * 0.8,
      descent: fontSpec.fontSize * 0.2,
    };
  },
};

/**
 * Metrics backed by a real `CanvasRenderingContext2D.measureText`.
 *
 * Only usable in browser contexts (preview, Chromium golden-image tests);
 * `measureText` is not available in Node, so this class is never exercised in
 * Node unit tests.
 *
 * Ascent/descent choice: `TextMetrics.fontBoundingBox{Ascent,Descent}` describe
 * the font's line box and are preferred because they are stable across the glyphs
 * in a run; where a browser does not provide them we fall back to the
 * glyph-specific `actualBoundingBox{Ascent,Descent}`.
 *
 * `letterSpacing` handling: per-character spacing is applied at layout time
 * (see `layout.ts`, Task 5.3), not inside the metrics provider. `measureText`
 * returns a single-run advance; the layout pass distributes `letterSpacing`
 * between clusters. This keeps the provider a thin wrapper over the native API.
 */
export class CanvasMetricsProvider implements TextMetricsProvider {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  measure(
    text: string,
    fontSpec: FontSpec,
  ): { width: number; ascent: number; descent: number } {
    this.ctx.font = `${fontSpec.fontWeight} ${fontSpec.fontSize}px ${fontSpec.fontFamily}`;
    const metrics = this.ctx.measureText(text);
    const ascent =
      metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent =
      metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    return {
      width: metrics.width,
      ascent,
      descent,
    };
  }
}
