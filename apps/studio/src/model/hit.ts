/**
 * Pure canvas hit-testing and drag math (Requirement 3.8-3.15). No DOM, no clock,
 * no randomness. All coordinates are CANVAS pixels unless a name says otherwise.
 *
 * Bounds come from a resolved engine FrameState: anchor + positionOffset + the
 * union of the layout boxes of the layer's visible glyph clusters. Effect scale,
 * rotation, blur and per-segment offsets are ignored so the box is stable while
 * the text animates.
 */
import type { FrameState, LayerState } from "@studio/engine";

export type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * Share of the glyph box above the baseline. Tuned for Noto Sans; the descent
 * share is 1 - ASCENT_RATIO. FrameState carries only height = ascent + descent,
 * so the split is an approximation.
 */
export const ASCENT_RATIO = 0.8;

/** Slop around a box, in CSS px on screen (divided by display scale for canvas px). */
export const HIT_SLOP_CSS_PX = 8;

const COLLAPSIBLE = /^[ \t\r\n]+$/;

/** Union of visible-cluster boxes offset by anchor + positionOffset; null when none. */
export function layerBounds(layer: LayerState): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of layer.segments) {
    if (COLLAPSIBLE.test(seg.text)) continue;
    const x0 = seg.layoutX;
    const x1 = seg.layoutX + seg.width;
    const y0 = seg.layoutY - ASCENT_RATIO * seg.height;
    const y1 = seg.layoutY + (1 - ASCENT_RATIO) * seg.height;
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  }
  if (minX === Infinity) return null;
  const ox = layer.anchor.x + layer.transform.positionOffset[0];
  const oy = layer.anchor.y + layer.transform.positionOffset[1];
  return { x: ox + minX, y: oy + minY, w: maxX - minX, h: maxY - minY };
}

/** True when (x, y) lies inside the rectangle grown by `pad` on every side. */
export function rectContains(r: Rect, x: number, y: number, pad: number): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Topmost layer id whose padded box contains (x, y); pad = 8 / displayScale. */
export function hitTest(state: FrameState, x: number, y: number, displayScale: number): string | null {
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const pad = HIT_SLOP_CSS_PX / scale;
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const b = layerBounds(state.layers[i]);
    if (b && rectContains(b, x, y, pad)) return state.layers[i].layerId;
  }
  return null;
}

/** Viewport px -> canvas px; null for a zero-size rect. Not clamped. */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvas: Size,
): Pt | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: ((clientX - rect.left) * canvas.width) / rect.width,
    y: ((clientY - rect.top) * canvas.height) / rect.height,
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * New anchor for a drag: start anchor + pointer delta, Shift keeps the dominant
 * axis (a tie keeps x), rounded to the grid (default 1 px), clamped to the canvas.
 */
export function dragAnchor(args: {
  startAnchor: Pt;
  startPointer: Pt;
  pointer: Pt;
  shift: boolean;
  snap?: number;
  canvas: Size;
}): Pt {
  let dx = args.pointer.x - args.startPointer.x;
  let dy = args.pointer.y - args.startPointer.y;
  if (args.shift) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const step = args.snap !== undefined && Number.isFinite(args.snap) && args.snap > 0 ? args.snap : 1;
  const snap = (v: number): number => Math.round(v / step) * step;
  return {
    x: clamp(snap(args.startAnchor.x + dx), 0, args.canvas.width),
    y: clamp(snap(args.startAnchor.y + dy), 0, args.canvas.height),
  };
}

/** Arrow-key nudge by 1 px (10 with Shift), clamped; null for any other key. */
export function nudgeAnchor(anchor: Pt, key: string, shift: boolean, canvas: Size): Pt | null {
  const n = shift ? 10 : 1;
  let dx = 0;
  let dy = 0;
  if (key === "ArrowLeft") dx = -n;
  else if (key === "ArrowRight") dx = n;
  else if (key === "ArrowUp") dy = -n;
  else if (key === "ArrowDown") dy = n;
  else return null;
  return { x: clamp(anchor.x + dx, 0, canvas.width), y: clamp(anchor.y + dy, 0, canvas.height) };
}
