/**
 * Unit tests for `renderFrame` (Task 9.3).
 *
 * `renderFrame` is pure composition: it builds the metrics provider, calls
 * `computeFrameState(project, t, opts)`, then paints the result with
 * `drawFrame(ctx, state)`. These tests mock both halves (`./compute.js` and
 * `./draw.js`) so they assert the WIRING — the exact arguments each receives
 * and that the computed state flows into the painter — without exercising the
 * real compute or draw logic (which have their own suites).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { computeFrameState } from "./compute.js";
import { drawFrame } from "./draw.js";
import { renderFrame } from "./render.js";
import { FakeMetricsProvider } from "./metrics.js";
import type { FrameState } from "./compute.js";
import type { Project } from "./schemas/project.js";

vi.mock("./compute.js", () => ({
  computeFrameState: vi.fn(),
}));

vi.mock("./draw.js", () => ({
  drawFrame: vi.fn(),
}));

const computeMock = vi.mocked(computeFrameState);
const drawMock = vi.mocked(drawFrame);

/** A stand-in state returned by the mocked compute and threaded into draw. */
const fakeState = { marker: "frame-state" } as unknown as FrameState;

/** A stand-in project; its shape is irrelevant because compute is mocked. */
const fakeProject = { id: "proj" } as unknown as Project;

/** A stand-in 2D context; identity is all we assert on. */
const fakeCtx = {} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  computeMock.mockReset();
  drawMock.mockReset();
  computeMock.mockReturnValue(fakeState);
});

describe("renderFrame — wiring", () => {
  it("calls computeFrameState with the project, t, and assembled opts (incl. metricsProvider)", () => {
    const registry = { register: vi.fn(), get: vi.fn() };
    const layoutCache = new Map();

    renderFrame(fakeProject, 2.5, {
      ctx: fakeCtx,
      metricsProvider: FakeMetricsProvider,
      registry,
      layoutCache,
    });

    expect(computeMock).toHaveBeenCalledTimes(1);
    expect(computeMock).toHaveBeenCalledWith(fakeProject, 2.5, {
      metricsProvider: FakeMetricsProvider,
      registry,
      layoutCache,
    });
  });

  it("calls drawFrame with ctx and the state returned by computeFrameState", () => {
    renderFrame(fakeProject, 0, {
      ctx: fakeCtx,
      metricsProvider: FakeMetricsProvider,
    });

    expect(drawMock).toHaveBeenCalledTimes(1);
    expect(drawMock).toHaveBeenCalledWith(fakeCtx, fakeState);
  });

  it("passes a metricsProvider even when one is not supplied (default provider)", () => {
    renderFrame(fakeProject, 1, { ctx: fakeCtx });

    expect(computeMock).toHaveBeenCalledTimes(1);
    const callArgs = computeMock.mock.calls[0];
    expect(callArgs[0]).toBe(fakeProject);
    expect(callArgs[1]).toBe(1);
    // A default CanvasMetricsProvider is constructed from ctx.
    expect(callArgs[2].metricsProvider).toBeDefined();
    expect(typeof callArgs[2].metricsProvider.measure).toBe("function");
    expect(callArgs[2].registry).toBeUndefined();
    expect(callArgs[2].layoutCache).toBeUndefined();
  });

  it("computes before drawing (state flows from compute into draw)", () => {
    renderFrame(fakeProject, 3, { ctx: fakeCtx, metricsProvider: FakeMetricsProvider });

    // compute must have been invoked before draw, and draw receives its result.
    const computeOrder = computeMock.mock.invocationCallOrder[0];
    const drawOrder = drawMock.mock.invocationCallOrder[0];
    expect(computeOrder).toBeLessThan(drawOrder);
    expect(drawMock).toHaveBeenCalledWith(fakeCtx, fakeState);
  });
});
