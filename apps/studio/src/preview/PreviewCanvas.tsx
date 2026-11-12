/**
 * Preview canvas (Requirement 1, 2, 3.8-3.20, 9). Owns the <canvas> at project
 * pixel size. The playback clock drives per-frame draws directly (no React
 * re-render per frame); React re-renders only when the canvas size/background
 * changes. CSS fits the canvas to its container so preview pixels equal export
 * pixels (parity). A checkerboard shows transparency.
 *
 * Direct manipulation: click selects the topmost layer under the pointer, drag
 * moves its anchor (one undo step per gesture), Arrow keys nudge it. Hit boxes
 * come from a separate hit-only FrameState with its own CanvasMetricsProvider
 * (same font string as the painter), rebuilt when fonts finish loading. The
 * selection outline is an overlay element positioned with CSS custom properties.
 */
import { useEffect, useRef, type RefObject } from "react";
import { CanvasMetricsProvider, computeFrameState, type FrameState, type Project } from "@studio/engine";

import { PlaybackClock } from "../playback/clock.js";
import { playingSink } from "../playback/playing.js";
import { drawPreviewFrame, makePreviewRenderer } from "./draw.js";
import { onFontsLoadingDone } from "../fonts/fonts.js";
import { clientToCanvas, dragAnchor, hitTest, layerBounds, nudgeAnchor } from "../model/hit.js";
import { setCssVars } from "../ui/cssvars.js";
import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";

interface Drag {
  pointerId: number;
  layerId: string;
  startPointer: { x: number; y: number };
  startAnchor: { x: number; y: number };
}

export function PreviewCanvas({ store, canvasRef }: { store: Store; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const width = useStoreState(store, (s) => s.project.canvas.width);
  const height = useStoreState(store, (s) => s.project.canvas.height);
  const transparent = useStoreState(store, (s) => s.project.background === "transparent");
  const outlineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let renderer = makePreviewRenderer(store.getState().project);
    let rendererW = store.getState().project.canvas.width;
    let rendererH = store.getState().project.canvas.height;

    // Hit-only provider: bound to its OWN detached canvas, never shared with the
    // paint renderer or any export. Rebuilt on font load so boxes never stay on
    // fallback-font metrics.
    type LayoutCache = NonNullable<NonNullable<Parameters<typeof computeFrameState>[2]>["layoutCache"]>;
    const makeHit = (): { provider: CanvasMetricsProvider; cache: LayoutCache } => {
      const hc = document.createElement("canvas");
      return { provider: new CanvasMetricsProvider(hc.getContext("2d") as CanvasRenderingContext2D), cache: new Map() };
    };
    let hit = makeHit();
    const hitState = (): FrameState => {
      const { project, ui } = store.getState();
      return computeFrameState(project, ui.playhead, {
        metricsProvider: hit.provider,
        layoutCache: hit.cache,
      });
    };

    const paint = (t: number): void => {
      const p: Project = store.getState().project;
      // Rebuild the renderer if the canvas size changed (new stage size).
      if (p.canvas.width !== rendererW || p.canvas.height !== rendererH) {
        renderer = makePreviewRenderer(p);
        rendererW = p.canvas.width;
        rendererH = p.canvas.height;
      }
      drawPreviewFrame(renderer, ctx, p, t);
    };

    const clock = new PlaybackClock({
      onTick: (t) => {
        store.setUi({ playhead: t });
        paint(t);
      },
      getDuration: () => store.getState().project.canvas.durationSeconds,
      getLoop: () => store.getState().ui.loop,
      onPlayingChange: playingSink(store),
    });
    // Expose for the transport + tests; paint the initial frame.
    (canvas as unknown as { __clock: PlaybackClock }).__clock = clock;
    paint(store.getState().ui.playhead);

    // ---- selection outline overlay (CSS custom properties, hidden while playing) ----
    const updateOutline = (): void => {
      const el = outlineRef.current;
      if (!el) return;
      const { ui } = store.getState();
      const rect = canvas.getBoundingClientRect();
      let shown = false;
      if (!clock.isPlaying && ui.selectedLayerId !== null && rect.width > 0) {
        const layer = hitState().layers.find((l) => l.layerId === ui.selectedLayerId);
        const b = layer ? layerBounds(layer) : null;
        if (b) {
          const s = rect.width / canvas.width;
          const stage = (el.parentElement as HTMLElement).getBoundingClientRect();
          setCssVars(el, {
            "--x": rect.left - stage.left + b.x * s,
            "--y": rect.top - stage.top + b.y * s,
            "--w": b.w * s,
            "--h": b.h * s,
          });
          shown = true;
        }
      }
      el.classList.toggle("is-hidden", !shown);
    };

    // Live preview: repaint at the current playhead on any store change (edits),
    // except while playing (the clock already paints each frame then).
    const unsub = store.subscribe(() => {
      if (!clock.isPlaying) paint(store.getState().ui.playhead);
      updateOutline();
    });
    const resizeObs = new ResizeObserver(() => updateOutline());
    resizeObs.observe(canvas);
    updateOutline();

    // If a bundled face finishes loading after first paint, drop the layout
    // cache (new renderer => new metrics provider) and repaint.
    const unsubFonts = onFontsLoadingDone(() => {
      renderer = makePreviewRenderer(store.getState().project);
      rendererW = store.getState().project.canvas.width;
      rendererH = store.getState().project.canvas.height;
      hit = makeHit();
      if (!clock.isPlaying) paint(store.getState().ui.playhead);
      updateOutline();
    });

    // ---- pointer drag ----
    let drag: Drag | null = null;
    const toCanvas = (e: PointerEvent) =>
      clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), { width: canvas.width, height: canvas.height });
    const displayScale = (): number => canvas.getBoundingClientRect().width / canvas.width;
    const endDrag = (): void => {
      drag = null;
      canvas.classList.remove("is-dragging");
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const pt = toCanvas(e);
      if (!pt) return;
      const id = hitTest(hitState(), pt.x, pt.y, displayScale());
      if (id === null) return; // empty canvas: selection unchanged
      const layer = store.getState().project.layers.find((l) => l.id === id);
      if (!layer) return;
      store.setUi({ selectedLayerId: id });
      clock.pause();
      store.beginGesture();
      drag = { pointerId: e.pointerId, layerId: id, startPointer: pt, startAnchor: { ...layer.anchor } };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
      canvas.focus();
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (drag && e.pointerId === drag.pointerId) {
        const pt = toCanvas(e);
        if (!pt) return;
        const next = dragAnchor({
          startAnchor: drag.startAnchor,
          startPointer: drag.startPointer,
          pointer: pt,
          shift: e.shiftKey,
          canvas: { width: canvas.width, height: canvas.height },
        });
        store.preview({ type: "set-anchor", id: drag.layerId, x: next.x, y: next.y });
        return;
      }
      const pt = toCanvas(e);
      const over = pt !== null && hitTest(hitState(), pt.x, pt.y, displayScale()) !== null;
      canvas.classList.toggle("is-over-layer", over);
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const id = drag.pointerId;
      endDrag();
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      store.commitGesture();
    };

    const onPointerCancel = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      endDrag();
      store.cancelGesture();
    };

    const onLostCapture = (e: PointerEvent): void => {
      // Capture lost without a pointerup (drag still set): treat as cancel.
      if (!drag || e.pointerId !== drag.pointerId) return;
      endDrag();
      store.cancelGesture();
    };

    const onPointerLeave = (): void => {
      if (!drag) canvas.classList.remove("is-over-layer");
    };

    // ---- keyboard: Escape cancels a drag, Arrow keys nudge the selected layer ----
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && drag) {
        endDrag();
        store.cancelGesture();
        e.preventDefault();
        return;
      }
      const { project, ui } = store.getState();
      const layer = project.layers.find((l) => l.id === ui.selectedLayerId);
      if (!layer) return;
      const next = nudgeAnchor(layer.anchor, e.key, e.shiftKey, { width: canvas.width, height: canvas.height });
      if (!next) return;
      e.preventDefault();
      store.dispatchGuarded({ type: "set-anchor", id: layer.id, x: next.x, y: next.y });
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onLostCapture);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("keydown", onKeyDown);
      resizeObs.disconnect();
      unsub();
      unsubFonts();
      clock.dispose();
    };
    // Re-init when the canvas backing size changes (new project dimensions).
  }, [store, width, height]);

  return (
    <div className="preview-stage" data-transparent={transparent}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="preview-canvas"
        tabIndex={0}
        aria-label="Preview canvas. Click a layer to select it, drag to move it, or use the arrow keys."
      />
      <div ref={outlineRef} className="selection-outline is-hidden" aria-hidden="true" />
    </div>
  );
}

/** Reads the clock a PreviewCanvas attached to its canvas (for the transport). */
export function getClock(canvas: HTMLCanvasElement | null): PlaybackClock | null {
  return canvas ? ((canvas as unknown as { __clock?: PlaybackClock }).__clock ?? null) : null;
}
