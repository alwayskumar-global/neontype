/**
 * App shell placeholder (Group 1). The full composition root — preview, panels,
 * timeline, export — is built in Groups 2+. This renders a minimal, CSP-clean
 * shell so the scaffold builds and runs under the strict CSP.
 *
 * A Group-1 worker/CSP probe is exposed on `window` so a Playwright smoke can
 * confirm that constructing a module Worker from a bundler URL and posting
 * messages works under the strict CSP (`worker-src 'self' blob:`). The real
 * exporter worker path is wired in Group 3 with the export dialog; see the
 * Group-1 report note about the exporters ambient-types cross-package issue.
 */
import { useEffect } from "react";

import { newProject } from "../model/project.js";
import { frameCountFor } from "../model/selectors.js";

declare global {
  interface Window {
    __studioWorkerProbe?: () => Promise<boolean>;
  }
}

export function App() {
  const project = newProject();
  useEffect(() => {
    window.__studioWorkerProbe = async () => {
      // A minimal module worker built from a bundler URL (same construction the
      // exporter uses). Proves the strict CSP allows worker-src/connect blob:.
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
  }, []);
  return (
    <main className="app-shell">
      <h1>Studio</h1>
      <p>
        {project.canvas.width}x{project.canvas.height} - {project.canvas.fps} fps -{" "}
        {frameCountFor(project)} frames
      </p>
    </main>
  );
}
