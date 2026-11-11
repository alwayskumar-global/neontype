/**
 * Property 18: per-line alignment (Requirements 5.15, 11.18).
 *
 * For every line that has at least one non-whitespace cluster (including lines
 * made by maxWidth wrapping and by explicit "\n"), with L = layoutX of the
 * line's first cluster and R = layoutX + width of its last non-whitespace
 * cluster: center => |L + R| <= eps; left => L = 0; right => R = 0.
 * In the sub-domain letterSpacing >= 0 with a non-whitespace first cluster the
 * literal bounding-box form holds: min layoutX is L and the max right edge over
 * non-whitespace clusters is R.
 */
// Feature: engine-core, Property 18: Per-line alignment
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { layoutSegments, type LayoutGeometry } from "./layout.js";
import { FakeMetricsProvider } from "./metrics.js";
import { segmentText } from "./segment.js";
import type { TextLayer } from "./schemas/project.js";
import { arbAlign, arbAlignText } from "./testing/arbitraries.js";

const isBlank = (t: string): boolean => /^\s*$/.test(t);
const near = (a: number, b: number, scale: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, scale);

interface Line {
  clusters: { text: string; x: number; width: number }[];
}

/** Groups clusters into lines by layoutY (identical for every cluster of a line). */
function linesOf(texts: string[], geoms: readonly LayoutGeometry[]): Line[] {
  const byY = new Map<number, Line>();
  geoms.forEach((g, i) => {
    let line = byY.get(g.layoutY);
    if (!line) {
      line = { clusters: [] };
      byY.set(g.layoutY, line);
    }
    line.clusters.push({ text: texts[i], x: g.layoutX, width: g.width });
  });
  return [...byY.values()];
}

describe("Property 18: per-line alignment", () => {
  it("center is symmetric, left starts at the anchor, right ends at it, across wrapped lines", () => {
    fc.assert(
      fc.property(
        arbAlignText,
        arbAlign,
        fc.integer({ min: 4, max: 120 }),
        fc.integer({ min: -5, max: 20 }),
        fc.option(fc.integer({ min: 1, max: 300 }), { nil: null }),
        (text, align, fontSize, letterSpacing, maxWidth) => {
          const layer = {
            id: "p", text, tracks: [], effectInstances: [], fontFamily: "Inter", fontSize, fontWeight: "400",
            fill: "#ffffff", align, letterSpacing, lineHeight: 1.2, maxWidth, startSeconds: 0, endSeconds: 2,
            anchor: { x: 0, y: 0 },
          } as TextLayer;
          const tokens = segmentText(text);
          const geoms = layoutSegments(tokens, layer, FakeMetricsProvider, new Map());
          const lines = linesOf(tokens.map((t) => t.text), geoms);

          for (const line of lines) {
            const visible = line.clusters.filter((c) => !isBlank(c.text));
            if (visible.length === 0) continue; // blank line: property does not apply
            const first = line.clusters[0];
            const last = visible[visible.length - 1];
            const L = first.x;
            const R = last.x + last.width;
            const scale = Math.max(Math.abs(L), Math.abs(R));
            if (align === "center") expect(near(L + R, 0, scale), `center L=${L} R=${R}`).toBe(true);
            if (align === "left") expect(near(L, 0, scale), `left L=${L}`).toBe(true);
            if (align === "right") expect(near(R, 0, scale), `right R=${R}`).toBe(true);

            // Sub-domain: literal bounding-box form.
            if (letterSpacing >= 0 && !isBlank(first.text)) {
              const minX = Math.min(...line.clusters.map((c) => c.x));
              const maxEdge = Math.max(...visible.map((c) => c.x + c.width));
              expect(near(minX, L, scale)).toBe(true);
              expect(near(maxEdge, R, scale)).toBe(true);
              if (align === "center") expect(near(minX + maxEdge, 0, scale)).toBe(true);
              if (align === "left") expect(near(minX, 0, scale)).toBe(true);
              if (align === "right") expect(near(maxEdge, 0, scale)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
