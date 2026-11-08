/**
 * App shell (Group 2 slice). Awaits the bundled-font gate, then composes the
 * preview canvas and transport over a single store. Panels/timeline/export come
 * in later groups. CSP-clean (no inline styles/scripts).
 */
import { useEffect, useRef, useState } from "react";

import "./../fonts/fonts.css";
import "./layout.css";
import { whenFontsReady, type FontStatus } from "../fonts/fonts.js";
import { Store } from "./store.js";
import { PreviewCanvas } from "../preview/PreviewCanvas.js";
import { Transport } from "../preview/Transport.js";
import { runParityProbe } from "../preview/parity-probe.js";
import { runPerfProbe, measureDemo } from "../preview/perf-probe.js";
import { SettingsPanel } from "../panels/SettingsPanel.js";
import { LayersPanel } from "../panels/LayersPanel.js";
import { EffectsPanel } from "../panels/EffectsPanel.js";
import { ExportDialog } from "../export/dialog.js";
import { downloadProject } from "../io/save.js";
import { loadProjectFromFile } from "../io/load.js";
import { demoProject } from "../model/demo.js";
import { newProject } from "../model/project.js";

declare global {
  interface Window {
    __studioWorkerProbe?: () => Promise<boolean>;
    __studioParityProbe?: () => Promise<number[]>;
    __studioPerfProbe?: (withBlur: boolean, seconds?: number) => Promise<{ mean: number; p95: number; count: number }>;
    __studioMeasureDemo?: (seconds?: number) => Promise<{ mean: number; p95: number; count: number }>;
  }
}

const store = new Store();

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fonts, setFonts] = useState<FontStatus | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    // Load the showcase demo on first start.
    store.setProject(demoProject());
    void whenFontsReady().then((s) => {
      if (active) setFonts(s);
    });
    if (import.meta.env.DEV) {
      window.__studioParityProbe = runParityProbe;
      window.__studioPerfProbe = runPerfProbe;
      window.__studioMeasureDemo = measureDemo;
      window.__studioWorkerProbe = async () => {
        const worker = new Worker(new URL("../playback/probe-worker.js", import.meta.url), { type: "module" });
        return await new Promise<boolean>((resolve) => {
          worker.addEventListener("message", (e: MessageEvent) => {
            worker.terminate();
            resolve(e.data === "pong");
          });
          worker.addEventListener("error", () => {
            worker.terminate();
            resolve(false);
          });
          worker.postMessage("ping");
        });
      };
    }
    return () => {
      active = false;
    };
  }, []);

  if (fonts === null) {
    return <main className="app-shell"><p>Loading fonts...</p></main>;
  }
  if (!fonts.ok) {
    return (
      <main className="app-shell">
        <p role="alert">Fonts failed to load ({fonts.code}): {fonts.message}</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1>Studio</h1>
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
