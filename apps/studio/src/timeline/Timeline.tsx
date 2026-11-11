/**
 * Timeline (Requirement 5): a ruler (playhead scrubber) and one row per layer
 * with a move bar and start/end trim handles. Bars, handles and the ruler are
 * focusable role=slider elements whose aria values carry SECONDS. Pointer drags
 * update the layer live and commit ONE set-layer-timing step on release; Arrow
 * keys step 1 frame (10 with Shift), one undo step per press. Positions are CSS
 * custom properties (percent of the axis), set through setCssVars (CSP-safe).
 */
import { useLayoutEffect, useRef, type RefObject } from "react";
import type { TextLayer } from "@studio/engine";

import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";
import { getClock } from "../preview/PreviewCanvas.js";
import { xToTime } from "../model/timemap.js";
import { dragTiming, lastFrame, nudgeTiming, pxToSeconds, toFrames, toSeconds, type TimingKind } from "../model/timeline.js";
import { setCssVars } from "../ui/cssvars.js";

const PART_NAME: Record<TimingKind, string> = { move: "move", start: "start", end: "end" };

/** Position of a time on the axis, in percent. */
const pct = (seconds: number, duration: number): number => (duration > 0 ? (seconds / duration) * 100 : 0);

export function Timeline({ store, canvasRef }: { store: Store; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const layers = useStoreState(store, (s) => s.project.layers);
  const fps = useStoreState(store, (s) => s.project.canvas.fps);
  const duration = useStoreState(store, (s) => s.project.canvas.durationSeconds);
  const playhead = useStoreState(store, (s) => s.ui.playhead);
  const selectedId = useStoreState(store, (s) => s.ui.selectedLayerId);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const scrubbing = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (playheadRef.current) setCssVars(playheadRef.current, { "--at": pct(playhead, duration) });
  }, [playhead, duration]);

  const seek = (t: number): void => getClock(canvasRef.current)?.seek(t);
  const scrubTo = (clientX: number): void => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seek(pxToSeconds(clientX - rect.left, { axisWidthPx: rect.width, durationSeconds: duration, fps }));
  };
  const N = lastFrame(duration, fps);

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="tl-row">
        <span className="tl-label">Time</span>
        <div
          ref={rulerRef}
          className="tl-track tl-ruler"
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={playhead}
          aria-valuetext={`${playhead.toFixed(2)} seconds`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubbing.current = e.pointerId;
            e.currentTarget.focus();
            scrubTo(e.clientX);
          }}
          onPointerMove={(e) => { if (scrubbing.current === e.pointerId) scrubTo(e.clientX); }}
          onPointerUp={(e) => {
            if (scrubbing.current !== e.pointerId) return;
            scrubbing.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowRight" ? 1 : -1);
            const f = Math.min(Math.max(toFrames(playhead, fps) + step, 0), Math.max(0, N));
            seek(toSeconds(f, fps));
          }}
        >
          <div ref={playheadRef} className="tl-playhead" />
        </div>
      </div>
      {layers.map((layer) => (
        <TimelineRow key={layer.id} store={store} layer={layer} fps={fps} duration={duration} selected={layer.id === selectedId} />
      ))}
    </section>
  );
}

function TimelineRow({ store, layer, fps, duration, selected }: { store: Store; layer: TextLayer; fps: number; duration: number; selected: boolean }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className={selected ? "tl-row selected" : "tl-row"}>
      <span className="tl-label" title={layer.text}>{layer.text}</span>
      <div ref={trackRef} className="tl-track">
        <Part store={store} layer={layer} kind="move" fps={fps} duration={duration} trackRef={trackRef} />
        <Part store={store} layer={layer} kind="start" fps={fps} duration={duration} trackRef={trackRef} />
        <Part store={store} layer={layer} kind="end" fps={fps} duration={duration} trackRef={trackRef} />
      </div>
    </div>
  );
}

interface PartProps {
  store: Store;
  layer: TextLayer;
  kind: TimingKind;
  fps: number;
  duration: number;
  trackRef: RefObject<HTMLDivElement | null>;
}

function Part({ store, layer, kind, fps, duration, trackRef }: PartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; start: { startSeconds: number; endSeconds: number } } | null>(null);
  const N = lastFrame(duration, fps);
  const disabled = !(N >= 1);
  const timing = { startSeconds: layer.startSeconds, endSeconds: layer.endSeconds };

  // The range this part can take, in seconds (from the drag bounds).
  const lo = kind === "move" ? dragTiming("move", timing, -1e9, fps, duration).startSeconds
    : kind === "start" ? 0 : dragTiming("end", timing, -1e9, fps, duration).endSeconds;
  const hi = kind === "move" ? dragTiming("move", timing, 1e9, fps, duration).startSeconds
    : kind === "start" ? dragTiming("start", timing, 1e9, fps, duration).startSeconds : dragTiming("end", timing, 1e9, fps, duration).endSeconds;
  const now = kind === "end" ? layer.endSeconds : layer.startSeconds;

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (kind === "move") setCssVars(ref.current, { "--from": pct(layer.startSeconds, duration), "--len": pct(layer.endSeconds - layer.startSeconds, duration) });
    else setCssVars(ref.current, { "--at": pct(now, duration) });
  }, [kind, layer.startSeconds, layer.endSeconds, duration, now]);

  const commitTiming = (t: { startSeconds: number; endSeconds: number }, live: boolean): void => {
    const action = { type: "set-layer-timing" as const, id: layer.id, startSeconds: t.startSeconds, endSeconds: t.endSeconds };
    if (live) store.preview(action);
    else store.dispatchGuarded(action);
  };

  const className = kind === "move" ? "tl-bar" : `tl-handle tl-handle-${kind}`;
  return (
    <div
      ref={ref}
      className={className}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={`${layer.text}, ${PART_NAME[kind]}`}
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={now}
      aria-valuetext={`${now.toFixed(2)} seconds`}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        store.setUi({ selectedLayerId: layer.id });
        store.beginGesture();
        drag.current = { pointerId: e.pointerId, startX: e.clientX, start: timing };
        e.currentTarget.focus();
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const track = trackRef.current;
        if (!d || d.pointerId !== e.pointerId || !track) return;
        const rect = track.getBoundingClientRect();
        const dt = xToTime(e.clientX - rect.left, rect.width, duration) - xToTime(d.startX - rect.left, rect.width, duration);
        commitTiming(dragTiming(kind, d.start, toFrames(dt, fps), fps, duration), true);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        store.commitGesture();
      }}
      onPointerCancel={(e) => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return;
        drag.current = null;
        store.cancelGesture();
      }}
      onLostPointerCapture={(e) => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return;
        drag.current = null;
        store.cancelGesture();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && drag.current) {
          drag.current = null;
          store.cancelGesture();
          e.preventDefault();
          return;
        }
        if (disabled || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowRight" ? 1 : -1);
        commitTiming(nudgeTiming(kind, timing, step, fps, duration), false);
      }}
    />
  );
}
