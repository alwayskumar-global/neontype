/**
 * Settings panel (Requirement 2): canvas size (presets + custom), fps, duration,
 * background colour + transparent toggle. All edits dispatch pure model actions;
 * out-of-bound values are rejected by the model (validateInt helper shows an
 * inline message and does not dispatch an invalid value).
 */
import { useState } from "react";
import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";

const SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1080x1080", width: 1080, height: 1080 },
  { label: "1080x1920", width: 1080, height: 1920 },
];

export function SettingsPanel({ store }: { store: Store }) {
  const project = useStoreState(store, (s) => s.project);
  const { width, height, fps, durationSeconds } = project.canvas;
  const [err, setErr] = useState<string | null>(null);

  const num = (v: string): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <section className="panel" aria-label="Project settings">
      <h2 className="panel-title">Project</h2>

      <label className="field">
        <span>Size preset</span>
        <select
          value={`${width}x${height}`}
          onChange={(e) => {
            const p = SIZE_PRESETS.find((x) => `${x.width}x${x.height}` === e.target.value);
            if (p) store.dispatch({ type: "set-canvas-size", width: p.width, height: p.height });
          }}
        >
          {SIZE_PRESETS.every((p) => `${p.width}x${p.height}` !== `${width}x${height}`) && (
            <option value={`${width}x${height}`}>{width}x{height} (custom)</option>
          )}
          {SIZE_PRESETS.map((p) => (
            <option key={p.label} value={`${p.width}x${p.height}`}>{p.label}</option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input type="number" value={width} min={1} max={7680}
            onChange={(e) => {
              const n = num(e.target.value);
              if (n === null) return;
              const next = store.dispatchGuarded({ type: "set-canvas-size", width: n, height });
              setErr(next ? null : "Width must be an integer in 1-7680.");
            }} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={height} min={1} max={4320}
            onChange={(e) => {
              const n = num(e.target.value);
              if (n === null) return;
              const next = store.dispatchGuarded({ type: "set-canvas-size", width, height: n });
              setErr(next ? null : "Height must be an integer in 1-4320.");
            }} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>FPS</span>
          <input type="number" value={fps} min={1} max={120}
            onChange={(e) => {
              const n = num(e.target.value);
              if (n === null) return;
              const ok = store.dispatchGuarded({ type: "set-fps", fps: n });
              setErr(ok ? null : "FPS must be in 1-120.");
            }} />
        </label>
        <label className="field">
          <span>Duration (s)</span>
          <input type="number" value={durationSeconds} min={0.1} max={600} step={0.1}
            onChange={(e) => {
              const n = num(e.target.value);
              if (n === null) return;
              const ok = store.dispatchGuarded({ type: "set-duration", durationSeconds: n });
              setErr(ok ? null : "Duration must be in 0.1-600s.");
            }} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Background</span>
          <input type="color"
            value={project.background === "transparent" ? "#101018" : project.background}
            disabled={project.background === "transparent"}
            onChange={(e) => store.dispatch({ type: "set-background", background: e.target.value })} />
        </label>
        <label className="field checkbox">
          <input type="checkbox" checked={project.background === "transparent"}
            onChange={(e) => store.dispatch({ type: "set-transparent", transparent: e.target.checked })} />
          <span>Transparent</span>
        </label>
      </div>

      {err && <p className="field-error" role="alert">{err}</p>}
    </section>
  );
}
