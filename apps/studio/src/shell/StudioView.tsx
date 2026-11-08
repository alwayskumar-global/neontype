/**
 * Studio editor view (the 3-column shell). Extracted from App so App can switch
 * between the landing page and the studio. CSP-clean (no inline styles/scripts).
 */
import { useRef, useState } from "react";

import { Store } from "./store.js";
import { PreviewCanvas } from "../preview/PreviewCanvas.js";
import { Transport } from "../preview/Transport.js";
import { SettingsPanel } from "../panels/SettingsPanel.js";
import { LayersPanel } from "../panels/LayersPanel.js";
import { EffectsPanel } from "../panels/EffectsPanel.js";
import { ExportDialog } from "../export/dialog.js";
import { downloadProject } from "../io/save.js";
import { loadProjectFromFile } from "../io/load.js";
import { demoProject } from "../model/demo.js";
import { newProject } from "../model/project.js";
import { PRODUCT_NAME } from "./product.js";

export function StudioView({ store, onBack }: { store: Store; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button type="button" className="brand-link" onClick={onBack} aria-label={`Back to ${PRODUCT_NAME} home`}>{PRODUCT_NAME}</button>
        <button type="button" onClick={() => { store.setProject(newProject()); setLoadError(null); }}>New</button>
        <button type="button" onClick={() => { store.setProject(demoProject()); setLoadError(null); }}>Load demo</button>
        <button type="button" onClick={() => downloadProject(store.getState().project)}>Save</button>
        <button type="button" onClick={() => fileRef.current?.click()}>Open</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-label="Open project file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const res = await loadProjectFromFile(file);
            if (res.ok) { store.setProject(res.project); setLoadError(null); }
            else setLoadError(res.message);
          }}
        />
        <button type="button" className="export-open" onClick={() => setExportOpen(true)}>Export</button>
      </header>
      {loadError && <p className="app-load-error" role="alert">{loadError}</p>}
      <aside className="app-left">
        <SettingsPanel store={store} />
        <LayersPanel store={store} />
      </aside>
      <main className="app-center">
        <PreviewCanvas store={store} canvasRef={canvasRef} />
        <Transport store={store} canvasRef={canvasRef} />
      </main>
      <aside className="app-right">
        <EffectsPanel store={store} />
      </aside>
      {exportOpen && <ExportDialog store={store} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
