/**
 * Effect picker (Requirement 4): lists exactly the engine presetCatalog (12
 * effects) with no hardcoded list; applies with catalog defaults + the first
 * supported granularity; edits params (input type inferred from the default
 * value, with selects for known enum params) and granularity; removes effects.
 * Invalid param edits are rejected by the model (dispatchGuarded).
 */
import { useState } from "react";
import { presetCatalog, type Granularity } from "@studio/engine";
import type { Store } from "../shell/store.js";
import { useStoreState } from "../shell/useStore.js";

/** Known enum options for string params (kept minimal; others use a text box). */
const ENUM_PARAMS: Record<string, string[]> = {
  easing: ["linear", "easeIn", "easeOut", "easeInOut"],
  direction: ["forward", "backward"],
  slideAxis: ["x", "y"],
  axis: ["x", "y"],
};

export function EffectsPanel({ store }: { store: Store }) {
  const project = useStoreState(store, (s) => s.project);
  const selectedId = useStoreState(store, (s) => s.ui.selectedLayerId);
  const [err, setErr] = useState<string | null>(null);
  const layer = project.layers.find((l) => l.id === selectedId);

  if (!layer) {
    return (
      <section className="panel" aria-label="Effects">
        <h2 className="panel-title">Effects</h2>
        <p className="muted">Select a layer to add effects.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Effects">
      <div className="panel-head">
        <h2 className="panel-title">Effects</h2>
        <select aria-label="Add effect" value=""
          onChange={(e) => {
            if (e.target.value) store.dispatch({ type: "add-effect", layerId: layer.id, effectId: e.target.value });
          }}>
          <option value="">Add effect...</option>
          {presetCatalog.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
      </div>

      <ul className="effect-list">
        {layer.effectInstances.map((inst, index) => {
          const entry = presetCatalog.find((p) => p.id === inst.effectId);
          return (
            <li key={index} className="effect">
              <div className="effect-head">
                <strong>{entry?.displayName ?? inst.effectId}</strong>
                <button type="button" aria-label="Remove effect"
                  onClick={() => store.dispatch({ type: "remove-effect", layerId: layer.id, index })}>remove</button>
              </div>
              <label className="field">
                <span>Granularity</span>
                <select value={inst.granularity}
                  onChange={(e) => store.dispatch({ type: "set-effect-granularity", layerId: layer.id, index, granularity: e.target.value as Granularity })}>
                  {(entry?.supportedGranularities ?? [inst.granularity]).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {Object.entries(inst.params).map(([key, value]) => (
                <label className="field" key={key}>
                  <span>{key}</span>
                  {renderParamInput(key, value, (v) => {
                    const ok = store.dispatchGuarded({ type: "set-effect-param", layerId: layer.id, index, key, value: v });
                    setErr(ok ? null : `Invalid value for ${key}.`);
                  })}
                </label>
              ))}
            </li>
          );
        })}
      </ul>
      {err && <p className="field-error" role="alert">{err}</p>}
    </section>
  );
}

function renderParamInput(key: string, value: unknown, onChange: (v: unknown) => void) {
  if (typeof value === "boolean") {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (typeof value === "number") {
    return <input type="number" value={value} step="any" onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (ENUM_PARAMS[key]) {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {ENUM_PARAMS[key].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}
