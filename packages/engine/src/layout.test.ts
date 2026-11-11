/**
 * Unit tests for `layoutSegments` (Task 5.3).
 *
 * Coverage mirrors the completion criteria:
 * - Warm cache SKIPS `measure`: a counting provider proves that a second call
 *   with identical layer params and the same cache returns without measuring.
 * - "ab" advance: `layoutX[1] === layoutX[0] + width[0] + letterSpacing`.
 * - Newline: the cluster after `"\n"` sits on the next line at column 0.
 * - maxWidth wrap: a cluster that overflows wraps to the next line at column 0.
 * - Frozen results: each geometry object (and the array) is frozen.
 *
 * All numbers use `FakeMetricsProvider`, where a single-char cluster has
 * `width = 1 * fontSize * 0.6`. With `fontSize = 10` every cluster is 6px wide,
 * `ascent = 8`, `descent = 2`, so `height = 10`.
 */

import { describe, expect, it } from "vitest";

import { layoutSegments, type LayoutGeometry } from "./layout.js";
import { FakeMetricsProvider, type FontSpec, type TextMetricsProvider } from "./metrics.js";
import { segmentText, type SegmentToken } from "./segment.js";
import type { TextLayer } from "./schemas/project.js";

/**
 * Builds a realistic, in-range `TextLayer` fixture. `fontSize` defaults to 10
 * so FakeMetricsProvider yields exact 6px-per-char widths and 10px line boxes.
 * Overrides let individual tests set `text`, `letterSpacing`, `lineHeight`, and
 * `maxWidth`.
 */
function makeLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: "layer-1",
    text: "ab",
    tracks: [],
    effectInstances: [],
    fontFamily: "Inter",
    fontSize: 10,
    fontWeight: "400",
    fill: "#ffffff",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    maxWidth: null,
    startSeconds: 0,
    endSeconds: 2,
    anchor: { x: 0, y: 0 },
    ...overrides,
  } as TextLayer;
}

/** A metrics provider that counts `measure` calls, delegating to the fake. */
function makeCountingProvider(): TextMetricsProvider & { count: number } {
  return {
    count: 0,
    measure(text: string, fontSpec: FontSpec) {
      this.count += 1;
      return FakeMetricsProvider.measure(text, fontSpec);
    },
  };
}

describe("layoutSegments", () => {
  it("skips metricsProvider.measure on a warm cache", () => {
    const layer = makeLayer({ text: "ab" });
    const tokens = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();
    const provider = makeCountingProvider();

    // Cold call: measures once per token (2 clusters).
    const first = layoutSegments(tokens, layer, provider, cache);
    const coldCount = provider.count;
    expect(coldCount).toBe(2);

    // Warm call: identical params + same cache Map → no further measuring.
    const second = layoutSegments(tokens, layer, provider, cache);
    expect(provider.count).toBe(coldCount);
    // Cache hit returns the stored array instance directly.
    expect(second).toBe(first);
  });

  it("advances layoutX by width + letterSpacing for 'ab'", () => {
    // fontSize 10 → width 6/char; letterSpacing 2 → layoutX[1] = 0 + 6 + 2 = 8.
    const layer = makeLayer({ text: "ab", letterSpacing: 2 });
    const tokens = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();

    const result = layoutSegments(tokens, layer, FakeMetricsProvider, cache);

    expect(result).toHaveLength(2);
    expect(result[0].layoutX).toBe(0);
    expect(result[0].width).toBe(6);
    expect(result[1].layoutX).toBe(result[0].layoutX + result[0].width + layer.letterSpacing);
    expect(result[1].layoutX).toBe(8);
    // Both clusters share line 0.
    expect(result[0].layoutY).toBe(0);
    expect(result[1].layoutY).toBe(0);
    // height = ascent(8) + descent(2) = 10.
    expect(result[0].height).toBe(10);
  });

  it("places the cluster after a newline on the next line at column 0", () => {
    // fontSize 10, lineHeight 1.2 → lineHeightPx = 12. "a\nb" → b on line 1.
    const layer = makeLayer({ text: "a\nb", lineHeight: 1.2 });
    const tokens = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();

    const result = layoutSegments(tokens, layer, FakeMetricsProvider, cache);

    // Tokens: "a", "\n", "b".
    expect(result).toHaveLength(3);
    // "a" on line 0 at column 0.
    expect(result[0].layoutX).toBe(0);
    expect(result[0].layoutY).toBe(0);
    // "\n" emitted at line 0 (the line it terminates).
    expect(result[1].layoutY).toBe(0);
    // "b" on the next line at column 0.
    expect(result[2].layoutX).toBe(0);
    expect(result[2].layoutY).toBe(layer.fontSize * layer.lineHeight);
    expect(result[2].layoutY).toBe(12);
  });

  it("wraps a cluster that overflows maxWidth onto the next line", () => {
    // fontSize 10 → width 6/char. maxWidth 8: first "a" at x=0 (advance → 6);
    // second "a" would place to 6, and 6 + 6 = 12 > 8 with currentX > 0 → wrap.
    const layer = makeLayer({ text: "aa", maxWidth: 8, letterSpacing: 0, lineHeight: 1.2 });
    const tokens = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();

    const result = layoutSegments(tokens, layer, FakeMetricsProvider, cache);

    expect(result).toHaveLength(2);
    // First cluster on line 0.
    expect(result[0].layoutX).toBe(0);
    expect(result[0].layoutY).toBe(0);
    // Second cluster wraps to line 1 at column 0.
    expect(result[1].layoutX).toBe(0);
    expect(result[1].layoutY).toBe(layer.fontSize * layer.lineHeight);
    expect(result[1].layoutY).toBe(12);
  });

  it("does not break at column 0 when a single cluster exceeds maxWidth", () => {
    // A single 6px cluster with maxWidth 4 must still be placed at column 0 on
    // line 0 (the guard prevents an infinite wrap loop).
    const layer = makeLayer({ text: "a", maxWidth: 4 });
    const tokens = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();

    const result = layoutSegments(tokens, layer, FakeMetricsProvider, cache);

    expect(result).toHaveLength(1);
    expect(result[0].layoutX).toBe(0);
    expect(result[0].layoutY).toBe(0);
  });

  it("freezes each geometry object and the returned array", () => {
    const layer = makeLayer({ text: "ab" });
    const tokens: SegmentToken[] = segmentText(layer.text);
    const cache = new Map<string, LayoutGeometry[]>();

    const result = layoutSegments(tokens, layer, FakeMetricsProvider, cache);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[1])).toBe(true);
  });
});

describe("alignment", () => {
  /** Lays out `text` with the given overrides and returns the layoutX of every cluster. */
  function xs(overrides: Partial<TextLayer>): number[] {
    const layer = makeLayer(overrides);
    const cache = new Map<string, LayoutGeometry[]>();
    // `+ 0` normalises -0 (computeFrameState does the same across the whole FrameState).
    return layoutSegments(segmentText(layer.text), layer, FakeMetricsProvider, cache).map((g) => g.layoutX + 0);
  }

  it("aligns 'abc' left, center and right (6 px clusters)", () => {
    expect(xs({ text: "abc", align: "left" })).toEqual([0, 6, 12]);
    expect(xs({ text: "abc", align: "center" })).toEqual([-9, -3, 3]);
    expect(xs({ text: "abc", align: "right" })).toEqual([-18, -12, -6]);
  });

  it("excludes the trailing letterSpacing from the extent", () => {
    // pen advances 8 per cluster; extent = 16 + 6 = 22, not 24.
    expect(xs({ text: "abc", align: "right", letterSpacing: 2 })).toEqual([-22, -14, -6]);
  });

  it("aligns each explicit line independently", () => {
    expect(xs({ text: "ab\nabcd", align: "center" })).toEqual([-6, 0, 6, -12, -6, 0, 6]);
  });

  it("aligns each wrapped line independently", () => {
    expect(xs({ text: "aaa", align: "center", maxWidth: 14 })).toEqual([-6, 0, -3]);
  });

  it("ignores trailing whitespace and the newline cluster when measuring the extent", () => {
    const r = xs({ text: "a \nb", align: "center" });
    expect(r[0]).toBe(-3);
    expect(r[1]).toBe(3);
    expect(r[3]).toBe(-3);
  });

  it("gives a line with no visible cluster an extent of 0", () => {
    expect(xs({ text: "\nab", align: "right" })).toEqual([0, -12, -6]);
  });

  it("treats a single cluster as its own line extent", () => {
    expect(xs({ text: "a", align: "center" })).toEqual([-3]);
    expect(xs({ text: "a", align: "right" })).toEqual([-6]);
  });

  it("includes align in the cache key: the same text with a different align misses the cache", () => {
    const cache = new Map<string, LayoutGeometry[]>();
    const provider = makeCountingProvider();
    const left = makeLayer({ text: "abc", align: "left" });
    const center = makeLayer({ text: "abc", align: "center" });
    const a = layoutSegments(segmentText(left.text), left, provider, cache);
    const afterLeft = provider.count;
    const b = layoutSegments(segmentText(center.text), center, provider, cache);
    expect(provider.count).toBe(afterLeft * 2); // measured again
    expect(b).not.toBe(a);
    expect(b[0].layoutX + 0).toBe(-9);
    // Same align again hits.
    const again = layoutSegments(segmentText(center.text), center, provider, cache);
    expect(again).toBe(b);
    expect(provider.count).toBe(afterLeft * 2);
  });
});
