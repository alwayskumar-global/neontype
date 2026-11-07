/**
 * `drawFrame` — the thin, pure painter that consumes a `FrameState`.
 *
 * `drawFrame(ctx, state)` is the only part of the render pipeline that touches a
 * `CanvasRenderingContext2D`. It performs NO interpolation, easing, layout, or
 * effect composition — all of that already happened in `computeFrameState`,
 * which produced the fully resolved `FrameState`. This module simply paints the
 * precomputed state onto the canvas.
 *
 * Defence in depth: although a `FrameState` from `computeFrameState` is already
 * sanitised, `drawFrame` treats every numeric and string value in the state as
 * UNTRUSTED. Non-finite numbers are never passed to a canvas call (a non-finite
 * transform contribution is skipped as identity); `blur` and `scale` are clamped
 * to safe ranges; the final `globalAlpha` is clamped to `[0, 1]`; and color
 * overrides are accepted only when they match the `#rrggbb` hex format. Every
 * `ctx.save()` is matched by a `ctx.restore()` on every control-flow path via
 * `try/finally`, so the context stack can never leak even on an early exit.
 *
 * The only external interface this module touches is the `ctx` argument: no DOM
 * reads, no network, no `eval`, no `innerHTML`.
 */

import type { FrameState, LayerState, BaseSegment } from "./compute.js";

/**
 * `#rrggbb` hex-color matcher. Defined locally so the painter never imports the
 * schema or Zod — it stays a thin, dependency-light drawing surface.
 */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Clamps `n` to `[min, max]`. Assumes `n` is already finite. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Returns `value` if it is a finite number, otherwise `fallback`. Used to turn
 * any untrusted non-finite contribution (NaN / ±Infinity) into a safe identity
 * before it reaches a canvas call.
 */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Returns `color` only when it is a valid `#rrggbb` hex string, otherwise
 * `undefined`. Invalid overrides are ignored so the caller can fall through to
 * the next color source.
 */
function validHex(color: string | undefined): string | undefined {
  return color !== undefined && HEX_COLOR_RE.test(color) ? color : undefined;
}

/**
 * Paints a single already-resolved `FrameState` onto `ctx`.
 *
 * Background: `"transparent"` clears the canvas; any other value is used as a
 * fill color for a full-canvas rect. Layers are painted in order; within each
 * layer, segments are painted in order. Transforms and overrides are applied
 * exactly as stored — only sanitised, never recomputed.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, state: FrameState): void {
  // Background: clear for transparent, fill otherwise. canvas size is trusted
  // enough to pass through, but guard against non-finite just in case.
  const w = finiteOr(state.canvasWidth, 0);
  const h = finiteOr(state.canvasHeight, 0);
  if (state.background === "transparent") {
    ctx.clearRect(0, 0, w, h);
  } else {
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, w, h);
  }

  for (const layer of state.layers) {
    drawLayer(ctx, layer);
  }
}

/** Paints one layer and all its segments, with a balanced save/restore. */
function drawLayer(ctx: CanvasRenderingContext2D, layer: LayerState): void {
  ctx.save();
  try {
    const t = layer.transform;

    // (b) translate to anchor + layer position offset. Any non-finite
    // contribution is treated as identity (0) rather than passed to the canvas.
    const anchorX = finiteOr(layer.anchor.x, 0);
    const anchorY = finiteOr(layer.anchor.y, 0);
    const offX = finiteOr(t.positionOffset[0], 0);
    const offY = finiteOr(t.positionOffset[1], 0);
    ctx.translate(anchorX + offX, anchorY + offY);

    // (c) rotate (degrees → radians). Non-finite rotation → identity (no rotate).
    const rotDeg = finiteOr(t.rotation, 0);
    if (rotDeg !== 0) {
      ctx.rotate((rotDeg * Math.PI) / 180);
    }

    // (d) scale. Non-finite scale → identity (1); clamp to [0, 100].
    const scale = clamp(finiteOr(t.scale, 1), 0, 100);
    if (scale !== 1) {
      ctx.scale(scale, scale);
    }

    // (e) layer opacity. Non-finite → identity (1); clamp to [0, 1].
    const layerOpacity = clamp(finiteOr(t.opacity, 1), 0, 1);
    ctx.globalAlpha = layerOpacity;

    // (f) font + alignment once per layer, from the layer style.
    const fontSize = finiteOr(layer.fontSize, 0);
    ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
    ctx.textAlign = layer.align;
    ctx.textBaseline = "alphabetic";

    // The layer's own color override is validated the same way as an effect
    // override; `layer.fill` comes from the validated schema and is the final
    // fallback.
    const layerColorOverride = validHex(t.colorOverride ?? undefined);

    for (const segment of layer.segments) {
      drawSegment(ctx, segment, layerOpacity, layerColorOverride, layer.fill, layer.fontSize);
    }
  } finally {
    ctx.restore();
  }
}

/** Paints one segment, with a balanced save/restore even on early exit. */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  segment: BaseSegment,
  layerOpacity: number,
  layerColorOverride: string | undefined,
  layerFill: string,
  fontSize: number,
): void {
  const ov = segment.effectOverrides;

  ctx.save();
  try {
    // translate to layout position + effect positionOffset (if present). The
    // local origin here is the glyph BASELINE (fillText draws at (0,0) with
    // textBaseline "alphabetic").
    const layoutX = finiteOr(segment.layoutX, 0);
    const layoutY = finiteOr(segment.layoutY, 0);
    const ovOffX = ov?.positionOffset ? finiteOr(ov.positionOffset[0], 0) : 0;
    const ovOffY = ov?.positionOffset ? finiteOr(ov.positionOffset[1], 0) : 0;
    ctx.translate(layoutX + ovOffX, layoutY + ovOffY);

    // Resolve the segment's scale/rotation overrides (clamped, identity-guarded)
    // so we can decide whether a pivot transform is needed at all.
    const rotDeg =
      ov?.rotation !== undefined ? finiteOr(ov.rotation, 0) : 0;
    const scaleVal =
      ov?.scale !== undefined ? clamp(finiteOr(ov.scale, 1), 0, 100) : 1;
    const needsRotate = rotDeg !== 0;
    const needsScale = scaleVal !== 1;

    // Requirement 17: pivot segment scale/rotation about the approximate glyph
    // center `(px, py)` — the horizontal center of the advance width at roughly
    // the vertical center of capital letters above the baseline. The pivot
    // wrapping is emitted ONLY when a finite non-identity scale and/or finite
    // non-zero rotation override is present, so segments without either (every
    // typewriter / fade-slide segment) produce a byte-identical call sequence
    // to before and keep existing golden images pixel-identical. Each non-finite
    // pivot component degrades to 0 independently.
    if (needsRotate || needsScale) {
      const px = Number.isFinite(segment.width) ? segment.width / 2 : 0;
      const py = Number.isFinite(fontSize) ? -0.35 * fontSize : 0;
      ctx.translate(px, py);
      if (needsRotate) {
        ctx.rotate((rotDeg * Math.PI) / 180);
      }
      if (needsScale) {
        ctx.scale(scaleVal, scaleVal);
      }
      ctx.translate(-px, -py);
    }

    // final alpha = layerOpacity * (effect opacity ?? 1), clamped to [0, 1].
    const segOpacity = ov?.opacity !== undefined ? finiteOr(ov.opacity, 1) : 1;
    ctx.globalAlpha = clamp(layerOpacity * segOpacity, 0, 1);

    // blur filter: clamp to [0, 1000]; only set a blur when meaningful,
    // otherwise always reset to 'none'.
    const blur = ov?.blur !== undefined ? clamp(finiteOr(ov.blur, 0), 0, 1000) : 0;
    ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";

    // fill color precedence: effect color → layer colorOverride → layer fill.
    // Each override is only honoured when it is a valid #rrggbb hex.
    const fill = validHex(ov?.color) ?? layerColorOverride ?? layerFill;
    ctx.fillStyle = fill;

    ctx.fillText(segment.text, 0, 0);
  } finally {
    ctx.restore();
  }
}
