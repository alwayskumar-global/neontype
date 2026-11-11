/**
 * App root. Shows the landing page first, then the studio (same SPA, no router).
 * View is kept in React state and mirrored to history (pushState/popstate) so
 * browser Back from the studio returns to the landing. Awaits the font gate
 * before rendering either view. DEV probes are gated by import.meta.env.DEV.
 */
import { useEffect, useRef, useState } from "react";

import "./../fonts/fonts.css";
import "./layout.css";
import { whenFontsReady, type FontStatus } from "../fonts/fonts.js";
import { Store } from "./store.js";
import { StudioView } from "./StudioView.js";
import { Landing } from "../landing/Landing.js";
import { demoProject } from "../model/demo.js";
import { newProject } from "../model/project.js";
import { frameCountFor } from "../model/selectors.js";
import { runParityProbe } from "../preview/parity-probe.js";
import { runPerfProbe, measureDemo } from "../preview/perf-probe.js";
import { runExportParity } from "../preview/export-parity-probe.js";

declare global {
  interface Window {
    __studioWorkerProbe?: () => Promise<boolean>;
    __studioParityProbe?: () => Promise<number[]>;
    __studioPerfProbe?: (withBlur: boolean, seconds?: number) => Promise<{ mean: number; p95: number; count: number }>;
    __studioMeasureDemo?: (seconds?: number) => Promise<{ mean: number; p95: number; count: number }>;
    __studioExportParity?: (tSeconds?: number) => Promise<number>;
  }
}

const store = new Store();
type View = "landing" | "studio";

export function App() {
  const [fonts, setFonts] = useState<FontStatus | null>(null);
  const [view, setView] = useState<View>("landing");
  const initialState = useRef<unknown>(null);

  useEffect(() => {
    let active = true;
    void whenFontsReady().then((s) => {
      if (active) setFonts(s);
    });
    // Browser Back returns to the landing page.
    const onPop = (e: PopStateEvent): void => {
      setView((e.state as { view?: View } | null)?.view === "studio" ? "studio" : "landing");
    };
    window.addEventListener("popstate", onPop);
    if (import.meta.env.DEV) {
      window.__studioParityProbe = runParityProbe;
      window.__studioPerfProbe = runPerfProbe;
      window.__studioMeasureDemo = measureDemo;
      window.__studioExportParity = (tSeconds = 3) => runExportParity(store.getState().project, tSeconds);
      window.__studioWorkerProbe = async () => {
        const worker = new Worker(new URL("../playback/probe-worker.js", import.meta.url), { type: "module" });
        return await new Promise<boolean>((resolve) => {
          worker.addEventListener("message", (ev: MessageEvent) => { worker.terminate(); resolve(ev.data === "pong"); });
          worker.addEventListener("error", () => { worker.terminate(); resolve(false); });
          worker.postMessage("ping");
        });
      };
    }
    void initialState;
    return () => {
      active = false;
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const openStudio = (demo: boolean): void => {
    const project = demo ? demoProject() : newProject();
    store.setProject(project);
    if (demo) {
      // Seek to a visible time so the opened studio shows settled content.
      const t = Math.min(project.canvas.durationSeconds, 3);
      store.setUi({ playhead: Math.min(t, (frameCountFor(project) - 1) / project.canvas.fps) });
    }
    window.history.pushState({ view: "studio" }, "");
    setView("studio");
  };

  const back = (): void => {
    window.history.back();
  };

  if (fonts === null) {
    return <main className="app-shell"><p>Loading fonts...</p></main>;
  }
  if (!fonts.ok) {
    return <main className="app-shell"><p role="alert">Fonts failed to load ({fonts.code}): {fonts.message}</p></main>;
  }

  return view === "landing" ? <Landing onOpenStudio={openStudio} /> : <StudioView store={store} onBack={back} />;
}
