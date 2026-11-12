/**
 * Metrics providers in the preview (task 2.3, as reworded by task 10.1): a canvas has ONE display
 * provider, owned by the exporter FrameRenderer that paints it, plus ONE hit-only provider that
 * PreviewCanvas creates for selection boxes. They are different objects bound to different canvases
 * and they never share a layout cache. The painter and the PreviewCanvas component need a browser, so
 * this is a static audit of how the two are built and wired.
 */
import { describe, it, expect } from "vitest";
import { readStudioText } from "../../scripts/dc-io.mjs";
const canvas = readStudioText("src/preview/PreviewCanvas.tsx");
const draw = readStudioText("src/preview/draw.ts");
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;
describe("one display provider and one hit-only provider per canvas", () => {
  it("the display provider belongs to the FrameRenderer, not to PreviewCanvas", () => {
    expect(draw).toMatch(/new FrameRenderer\(/);
    expect(count(draw, /new CanvasMetricsProvider\(/g)).toBe(0);
    expect(canvas).toMatch(/makePreviewRenderer\(/);
  });
  it("PreviewCanvas creates exactly one provider, for hit testing, on its own detached canvas", () => {
    expect(count(canvas, /new CanvasMetricsProvider\(/g)).toBe(1);
    expect(canvas).toMatch(/document\.createElement\("canvas"\)[\s\S]{0,200}new CanvasMetricsProvider\(/);
  });
  it("the hit provider has its own layout cache, used only for the hit FrameState", () => {
    expect(count(canvas, /new Map\(\)/g)).toBe(1);
    expect(canvas).toMatch(/metricsProvider: hit\.provider,\s*layoutCache: hit\.cache/);
    // The painter is never handed the hit provider or the hit cache.
    expect(count(canvas, /hit\.provider/g)).toBe(1);
    expect(count(canvas, /hit\.cache/g)).toBe(1);
    const paintSection = canvas.slice(canvas.indexOf("const paint = "), canvas.indexOf("const paint = ") + 900);
    expect(paintSection).not.toMatch(/hit\./);
  });
  it("the audit detects a shared provider (guard against a vacuous test)", () => {
    const bad = canvas.replace("metricsProvider: hit.provider", "metricsProvider: renderer.provider");
    expect(bad).not.toMatch(/metricsProvider: hit\.provider,\s*layoutCache: hit\.cache/);
  });
});
