/**
 * Layers panel (Requirement 3): add / edit text / delete / reorder, and per-layer
 * font family, size, weight (400|700), colour, alignment, position (anchor), and
 * numeric start offset + duration (the timeline is deferred to Group 4). Text is
 * rendered through React text nodes / inputs only — never innerHTML.
 */
import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";
import { BUNDLED_FAMILIES } from "../fonts/fonts.js";

export function LayersPanel({ store }: { store: Store }) {
  const project = useStoreState(store, (s) => s.project);
  const selectedId = useStoreState(store, (s) => s.ui.selectedLayerId);
  const layers = project.layers;
  const duration = project.canvas.durationSeconds;

  return (
    <section className="panel" aria-label="Layers">
      <div className="panel-head">
        <h2 className="panel-title">Layers</h2>
        <button type="button" onClick={() => store.dispatch({ type: "add-layer" })}>Add layer</button>
      </div>

      <ul className="layer-list">
        {layers.map((l, i) => (
          <li key={l.id} className={l.id === selectedId ? "layer selected" : "layer"}>
            <button type="button" className="layer-select" aria-pressed={l.id === selectedId}
              onClick={() => store.setUi({ selectedLayerId: l.id })}>
              {l.text || "(empty)"}
            </button>
            <div className="layer-ops">
              <button type="button" aria-label="Move up" disabled={i === 0}
                onClick={() => store.dispatch({ type: "reorder-layer", id: l.id, toIndex: i - 1 })}>up</button>
              <button type="button" aria-label="Move down" disabled={i === layers.length - 1}
                onClick={() => store.dispatch({ type: "reorder-layer", id: l.id, toIndex: i + 1 })}>down</button>
              <button type="button" aria-label="Delete layer"
                onClick={() => store.dispatch({ type: "delete-layer", id: l.id })}>del</button>
            </div>
          </li>
        ))}
      </ul>

      {selectedId && (() => {
        const l = layers.find((x) => x.id === selectedId);
        if (!l) return null;
        return (
          <div className="layer-editor">
            <label className="field">
              <span>Text</span>
              <input type="text" value={l.text}
                onChange={(e) => store.dispatch({ type: "set-text", id: l.id, text: e.target.value })} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Font</span>
                <select value={l.fontFamily}
                  onChange={(e) => store.dispatch({ type: "set-font-family", id: l.id, fontFamily: e.target.value as (typeof BUNDLED_FAMILIES)[number] })}>
                  {BUNDLED_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Weight</span>
                <select value={l.fontWeight}
                  onChange={(e) => store.dispatch({ type: "set-font-weight", id: l.id, fontWeight: e.target.value })}>
                  <option value="400">Regular</option>
                  <option value="700">Bold</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Size</span>
                <input type="number" value={l.fontSize} min={1} max={1000}
                  onChange={(e) => store.dispatch({ type: "set-font-size", id: l.id, fontSize: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>Colour</span>
                <input type="color" value={l.fill}
                  onChange={(e) => store.dispatch({ type: "set-fill", id: l.id, fill: e.target.value })} />
              </label>
              <label className="field">
                <span>Align</span>
                <select value={l.align}
                  onChange={(e) => store.dispatch({ type: "set-align", id: l.id, align: e.target.value as "left" | "center" | "right" })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>X</span>
                <input type="number" value={l.anchor.x}
                  onChange={(e) => store.dispatch({ type: "set-anchor", id: l.id, x: Number(e.target.value), y: l.anchor.y })} />
              </label>
              <label className="field">
                <span>Y</span>
                <input type="number" value={l.anchor.y}
                  onChange={(e) => store.dispatch({ type: "set-anchor", id: l.id, x: l.anchor.x, y: Number(e.target.value) })} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Start (s)</span>
                <input type="number" value={l.startSeconds} min={0} max={duration} step={0.1}
                  onChange={(e) => store.dispatch({ type: "set-layer-timing", id: l.id, startSeconds: Number(e.target.value), endSeconds: l.endSeconds })} />
              </label>
              <label className="field">
                <span>Duration (s)</span>
                <input type="number" value={Number((l.endSeconds - l.startSeconds).toFixed(3))} min={0.1} max={duration} step={0.1}
                  onChange={(e) => store.dispatch({ type: "set-layer-timing", id: l.id, startSeconds: l.startSeconds, endSeconds: l.startSeconds + Number(e.target.value) })} />
              </label>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
