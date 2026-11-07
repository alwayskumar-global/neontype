/**
 * Layout geometry computation with memoization.
 *
 * `layoutSegments` turns an ordered list of grapheme-cluster tokens (from
 * `segmentText`) into one `LayoutGeometry` per cluster: the cluster's position
 * relative to the layer origin plus its measured box. The origin `(0, 0)` is
 * the pen position of the first character; `layoutY` advances by whole line
 * heights down the page. NOTE: `drawFrame` consumes each `(layoutX, layoutY)`
 * as the glyph BASELINE origin — it paints with `ctx.fillText(text, 0, 0)` and
 * `textBaseline = "alphabetic"`, so glyphs render above `layoutY`, not below a
 * box top-left. Positions are expressed relative to the layer anchor and are
 * consumed per-frame by `computeFrameState` (Group 8), which wraps each
 * geometry in a `BaseSegment` and layers effect overrides on top. This module
 * deals only with geometry and never with effect overrides.
 *
 * Determinism/purity: the computation uses only `JSON.stringify`, arithmetic,
 * `Map`, and `Object.freeze`. There is no `Math.random`, `Date.now`,
 * `performance.now`, DOM, or network access, so it is safe to call from
 * `computeFrameState` in Node.
 *
 * Memoization: layout is pure in `(tokens, layer-layout-params)`. Callers pass
 * in a `Map` cache keyed on the layer fields that affect layout
 * (`text, fontFamily, fontSize, fontWeight, letterSpacing, lineHeight,
 * maxWidth`). The same tokens are always derived from the same `text`, so the
 * key need not include the tokens themselves. On a cache hit the stored array
 * is returned directly without calling `metricsProvider.measure` at all.
 *
 * `height` definition: each cluster's `height` is `ascent + descent` from the
 * metrics provider — the full vertical extent of the cluster's box.
 *
 * Line-break rule: a line break occurs in two cases.
 *   1. At an explicit `"\n"` cluster. The newline cluster is emitted at the
 *      current position (it is a zero-advance cluster), then the pen moves to
 *      the next line (`currentX = 0`, `currentLine += 1`).
 *   2. When wrapping on `maxWidth`: for a normal cluster, if `maxWidth` is not
 *      null and placing the cluster would overflow (`currentX + width >
 *      maxWidth`) AND the pen is not already at the start of the line
 *      (`currentX > 0`), wrap to a new line first, then place the cluster.
 *
 * "Don't break at column 0" guard: the `currentX > 0` condition guarantees that
 * a cluster placed at the start of a line is never forced to wrap. Without it, a
 * single grapheme wider than `maxWidth` would wrap forever (every attempt starts
 * at `currentX = 0`, overflows, wraps, and retries), producing an infinite loop.
 * The guard trades a one-cluster overflow for guaranteed forward progress.
 */

import type { SegmentToken } from "./segment.js";
import type { TextLayer } from "./schemas/project.js";
import type { FontSpec, TextMetricsProvider } from "./metrics.js";

/**
 * The computed geometry of a single grapheme cluster, relative to the layer
 * origin `(0, 0)` = the pen position of the first character.
 *
 * - `layoutX` / `layoutY`: the cluster's pen position, which `drawFrame`
 *   consumes as the glyph baseline origin (`textBaseline = "alphabetic"`), not
 *   the top-left of the glyph box.
 * - `width`: the cluster's measured advance width.
 * - `height`: the cluster's full vertical box (`ascent + descent`).
 */
export interface LayoutGeometry {
  layoutX: number;
  layoutY: number;
  width: number;
  height: number;
}

/**
 * Computes per-cluster layout geometry for a layer, memoized on the layer's
 * layout-affecting parameters.
 *
 * @param tokens - Grapheme-cluster tokens for `layer.text`, in order.
 * @param layer - The text layer supplying font and wrapping parameters.
 * @param metricsProvider - Measures each cluster. NOT called on a cache hit.
 * @param cache - Caller-owned memoization map; populated on a cache miss.
 * @returns One frozen `LayoutGeometry` per token, in token order. The returned
 *   array is itself frozen.
 */
export function layoutSegments(
  tokens: SegmentToken[],
  layer: TextLayer,
  metricsProvider: TextMetricsProvider,
  cache: Map<string, LayoutGeometry[]>,
): LayoutGeometry[] {
  const key = JSON.stringify([
    layer.text,
    layer.fontFamily,
    layer.fontSize,
    layer.fontWeight,
    layer.letterSpacing,
    layer.lineHeight,
    layer.maxWidth,
  ]);

  const hit = cache.get(key);
  if (hit) {
    return hit;
  }

  const fontSpec: FontSpec = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    letterSpacing: layer.letterSpacing,
  };

  const lineHeightPx = layer.fontSize * layer.lineHeight;

  const result: LayoutGeometry[] = [];
  let currentX = 0;
  let currentLine = 0;

  for (const token of tokens) {
    const m = metricsProvider.measure(token.text, fontSpec);
    const height = m.ascent + m.descent;

    if (token.text === "\n") {
      // Emit the newline cluster at the current pen position, then advance to
      // the next line. A newline is a zero-advance cluster: it does not move
      // `currentX`, it only ends the line.
      result.push(
        Object.freeze({
          layoutX: currentX,
          layoutY: currentLine * lineHeightPx,
          width: m.width,
          height,
        }),
      );
      currentLine += 1;
      currentX = 0;
      continue;
    }

    // maxWidth wrap: wrap BEFORE placing when the cluster would overflow and the
    // pen is not already at column 0 (the "don't break at column 0" guard).
    if (layer.maxWidth !== null && currentX + m.width > layer.maxWidth && currentX > 0) {
      currentLine += 1;
      currentX = 0;
    }

    const layoutX = currentX;
    const layoutY = currentLine * lineHeightPx;

    result.push(
      Object.freeze({
        layoutX,
        layoutY,
        width: m.width,
        height,
      }),
    );

    currentX += m.width + layer.letterSpacing;
  }

  Object.freeze(result);
  cache.set(key, result);
  return result;
}
