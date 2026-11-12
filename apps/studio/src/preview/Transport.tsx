/**
 * Transport controls + readout (Requirement 1.2-1.6). Play/pause/loop and a
 * scrubber drive the preview clock; the readout shows frame index, time, and
 * the total frame count. The clock lives in playback/; this only calls it.
 */
import { useSyncExternalStore } from "react";
import { frameCountFor, roundHalfAwayFromZero } from "../model/selectors.js";
import type { Store } from "../shell/store.js";
import { getClock } from "./PreviewCanvas.js";

export function Transport({ store, canvasRef }: { store: Store; canvasRef: { current: HTMLCanvasElement | null } }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { project, ui } = state;
  const total = frameCountFor(project);
  const fps = project.canvas.fps;
  const frameIndex = Math.min(total - 1, roundHalfAwayFromZero(ui.playhead * fps));

  return (
    <div className="transport" role="group" aria-label="Playback">
      <button type="button" onClick={() => getClock(canvasRef.current)?.play()}>Play</button>
      <button type="button" onClick={() => getClock(canvasRef.current)?.pause()}>Pause</button>
      <label>
        <input
          type="checkbox"
          checked={ui.loop}
          onChange={(e) => store.setUi({ loop: e.target.checked })}
        />
        Loop
      </label>
      <input
        type="range"
        aria-label="Scrub"
        min={0}
        max={project.canvas.durationSeconds}
        step={1 / fps}
        value={ui.playhead}
        onChange={(e) => getClock(canvasRef.current)?.seek(Number(e.target.value))}
      />
      <span className="readout" aria-label="Timecode">
        frame {frameIndex} / {total} - {ui.playhead.toFixed(2)}s
      </span>
    </div>
  );
}
