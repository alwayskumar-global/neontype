/**
 * `renderFrame` — the single entry point that turns a `Project` + time into a
 * painted canvas frame.
 *
 * `renderFrame` composes the two halves of the pipeline: `computeFrameState`
 * (pure data → `FrameState`) and `drawFrame` (thin painter → canvas). Preview,
 * every exporter, and the Chromium golden-image tests all call this same
 * function, so render logic is never duplicated.
 *
 * The 2D context is supplied on `opts.ctx`. Metrics default to a
 * `CanvasMetricsProvider` built from that context (browser contexts); callers
 * running headlessly inject a deterministic `FakeMetricsProvider` instead. The
 * `registry` and `layoutCache` options are forwarded to `computeFrameState`
 * untouched.
 */

import { computeFrameState } from "./compute.js";
import { drawFrame } from "./draw.js";
import { CanvasMetricsProvider } from "./metrics.js";
import type { TextMetricsProvider } from "./metrics.js";
import type { EffectRegistry } from "./registry.js";
import type { LayoutGeometry } from "./layout.js";
import type { Project } from "./schemas/project.js";

/**
 * Options for `renderFrame`.
 *
 * - `ctx` (required): the 2D context to paint onto; also the source of the
 *   default `CanvasMetricsProvider`.
 * - `metricsProvider` (optional): overrides the default metrics provider;
 *   inject a `FakeMetricsProvider` to render headlessly in Node.
 * - `registry` (optional): the effect registry; forwarded to
 *   `computeFrameState` (which defaults it to the built-in registry).
 * - `layoutCache` (optional): caller-owned layout memoization map; forwarded to
 *   `computeFrameState`.
 */
export interface RenderOpts {
  ctx: CanvasRenderingContext2D;
  metricsProvider?: TextMetricsProvider;
  registry?: EffectRegistry;
  layoutCache?: Map<string, LayoutGeometry[]>;
}

/**
 * Renders `project` at time `t` (seconds) onto `opts.ctx`.
 *
 * `opts` is required because the 2D context lives on it and cannot be obtained
 * otherwise. Computes the `FrameState` via `computeFrameState`, then paints it
 * via `drawFrame`.
 */
export function renderFrame(project: Project, t: number, opts: RenderOpts): void {
  const ctx = opts.ctx;
  const metricsProvider = opts.metricsProvider ?? new CanvasMetricsProvider(ctx);
  const state = computeFrameState(project, t, {
    metricsProvider,
    registry: opts.registry,
    layoutCache: opts.layoutCache,
  });
  drawFrame(ctx, state);
}
