import { describe, it, expect } from "vitest";
import { CanvasMetricsProvider, computeFrameState, drawFrame, FakeMetricsProvider } from "@studio/engine";
import { demoProject } from "../model/demo.js";

/**
 * The hit-only metrics provider must measure with EXACTLY the font string the
 * painter sets (Requirement 3.19), or hit boxes would drift from the drawn text.
 */
describe("hit provider font string equals the painter's", () => {
  it("is `${fontWeight} ${fontSize}px ${fontFamily}` for every demo layer", () => {
    const project = demoProject();
    const state = computeFrameState(project, 3, { metricsProvider: FakeMetricsProvider });

    // What the painter sets (recorded from drawFrame).
    const painted: string[] = [];
    const paintCtx = {
      clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
      set font(v: string) { painted.push(v); },
      set fillStyle(_v: string) {}, set globalAlpha(_v: number) {}, set filter(_v: string) {},
      set textAlign(_v: string) {}, set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
    drawFrame(paintCtx, state);

    // What the hit provider sets (recorded from CanvasMetricsProvider).
    const measured: string[] = [];
    const measureCtx = {
      set font(v: string) { measured.push(v); },
      measureText: () => ({ width: 1, fontBoundingBoxAscent: 1, fontBoundingBoxDescent: 1 }),
    } as unknown as CanvasRenderingContext2D;
    const provider = new CanvasMetricsProvider(measureCtx);
    for (const l of state.layers) {
      provider.measure("a", { fontFamily: l.fontFamily, fontSize: l.fontSize, fontWeight: l.fontWeight, letterSpacing: l.letterSpacing });
    }
    expect(measured).toEqual(painted);
    expect(painted.length).toBe(state.layers.length);
  });
});
