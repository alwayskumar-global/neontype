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
 * Alignment: `layer.align` is resolved HERE, per line, after wrapping. Each
 * line's extent is the right edge of its last non-collapsible-whitespace
 * cluster (trailing spaces, tabs and newline clusters, and the trailing
 * `letterSpacing`, do not count; a line with none has extent 0). Every cluster
 * on the line is then shifted by `0` (left), `-extent / 2` (center) or
 * `-extent` (right), so `layoutX` is relative to the anchor INCLUDING the
 * alignment offset. `drawFrame` therefore always paints with
 * `textAlign = "left"`.
 *
 * Memoization: layout is pure in `(tokens, layer-layout-params)`. Callers pass
 * in a `Map` cache keyed on the layer fields that affect layout
 * (`text, fontFamily, fontSize, fontWeight, letterSpacing, lineHeight,
 * maxWidth, align`). The same tokens are always derived from the same `text`, so the
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
/**
 * Collapsible whitespace: a cluster made only of these never defines a line's
 * extent. Matches " ", "\t", "\r" and "\n" clusters (and runs of them).
 */
const COLLAPSIBLE_RE = /^[ \t\r\n]+$/;

/** A cluster placed in pass 1, before the per-line alignment shift. */
interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  line: number;
}

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
    layer.align,
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

  // Pass 1: place clusters exactly as before (left-aligned, pen from x = 0 on each
  // line), recording each cluster's line and each line's extent.
  const placed: Placed[] = [];
  const lineExtent: number[] = [];
  let currentX = 0;
  let currentLine = 0;

  const place = (x: number, line: number, width: number, height: number, text: string): void => {
    placed.push({ x, y: line * lineHeightPx, width, height, line });
    if (!COLLAPSIBLE_RE.test(text)) {
      // Last non-collapsible cluster on the line wins: its right edge is the extent.
      lineExtent[line] = x + width;
    }
  };

  for (const token of tokens) {
    const m = metricsProvider.measure(token.text, fontSpec);
    const height = m.ascent + m.descent;

    if (token.text === "\n") {
      // Emit the newline cluster at the current pen position, then advance to
      // the next line. A newline is a zero-advance cluster: it does not move
      // `currentX`, it only ends the line.
      place(currentX, currentLine, m.width, height, token.text);
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

    place(currentX, currentLine, m.width, height, token.text);
    currentX += m.width + layer.letterSpacing;
  }

  // Pass 2: shift every cluster by its line's alignment offset (0 for a line
  // with no non-collapsible cluster).
  const result: LayoutGeometry[] = placed.map((p) => {
    const extent = lineExtent[p.line] ?? 0;
    const shift = layer.align === "center" ? -extent / 2 : layer.align === "right" ? -extent : 0;
    return Object.freeze({ layoutX: p.x + shift, layoutY: p.y, width: p.width, height: p.height });
  });

  Object.freeze(result);
  cache.set(key, result);
  return result;
}
