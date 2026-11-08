/**
 * App shell (Group 2 slice). Awaits the bundled-font gate, then composes the
 * preview canvas and transport over a single store. Panels/timeline/export come
 * in later groups. CSP-clean (no inline styles/scripts).
 */
import { useEffect, useRef, useState } from "react";

import "./../fonts/fonts.css";
import { whenFontsReady, type FontStatus } from "../fonts/fonts.js";
import { Store } from "./store.js";
import { PreviewCanvas } from "../preview/PreviewCanvas.js";
import { Transport } from "../preview/Transport.js";
import { runParityProbe } from "../preview/parity-probe.js";

declare global {
  interface Window {
    __studioWorkerProbe?: () => Promise<boolean>;
    __studioParityProbe?: () => Promise<number[]>;
  }
}

const store = new Store();

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fonts, setFonts] = useState<FontStatus | null>(null);

  useEffect(() => {
    let active = true;
    void whenFontsReady().then((s) => {
      if (active) setFonts(s);
    });
    window.__studioParityProbe = runParityProbe;
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
    <main className="app-shell">
      <h1>Studio</h1>
      <PreviewCanvas store={store} canvasRef={canvasRef} />
      <Transport store={store} canvasRef={canvasRef} />
    </main>
  );
}
