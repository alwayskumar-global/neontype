/**
 * Worker entry (Req 9.8). DOM-free: it uses only `OffscreenCanvas` via the
 * driver, never `document`/`window`. It receives a `start` message, registers any
 * supplied fonts (Req 15), runs the resolved driver's `runExport` loop, and posts
 * `progress` then `result`. An `abort` message flips a local flag the loop checks
 * at each frame boundary (Req 9.5). ANY thrown error is caught and posted as a
 * typed `error` message (mapped to `encoder-failure` on the host), never left as
 * an unhandled worker error (Req 10.9).
 *
 * Fonts: when fonts are requested but this worker has no `FontFace`/`self.fonts`,
 * it posts `{ type: "fonts-unsupported" }` and stops; the host terminates it and
 * reruns the same driver on the main thread. Faces registered here are never
 * released, because the host terminates the worker when the export settles.
 */

import type { MainToWorker, WorkerToMain } from "./protocol.js";
import { resolveDriver } from "./driver.js";
import { prepareFonts, fontsSupported } from "./fonts.js";

/**
 * The minimal dedicated-worker global surface this entry uses. Declared locally
 * instead of pulling in the `webworker` lib, whose globals conflict with the
 * `dom` lib the rest of the package compiles against.
 */
interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<MainToWorker>) => void): void;
  addEventListener(type: "error", listener: (event: { preventDefault(): void }) => void): void;
  addEventListener(type: "unhandledrejection", listener: (event: { preventDefault(): void }) => void): void;
}

const ctx = self as unknown as WorkerScope;

let aborted = false;

function post(message: WorkerToMain): void {
  ctx.postMessage(message);
}

ctx.addEventListener("message", (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  if (msg.type === "abort") {
    aborted = true;
    return;
  }
  if (msg.type !== "start") return;

  aborted = false;
  const driver = resolveDriver(msg.driverId);
  if (!driver) {
    post({ type: "error", code: "encoder-failure", message: `Unknown driver: ${msg.driverId}` });
    return;
  }

  // Only when fonts are requested: no FontFace / self.fonts -> main-thread fallback.
  if ((msg.options.fonts?.length ?? 0) > 0 && !fontsSupported()) {
    post({ type: "fonts-unsupported" });
    return;
  }

  void prepareFonts(msg.options.fonts)
    .then(({ failure }) =>
      failure ??
      driver(
        { format: msg.format, project: msg.project, options: msg.options, limits: msg.limits },
        (p) => post({ type: "progress", fraction: p.fraction, frame: p.frame, frameCount: p.frameCount }),
        () => aborted,
      ),
    )
    .then((result) => {
      post({ type: "result", result });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.name : "worker error";
      post({ type: "error", code: "encoder-failure", message: `Encoding failed: ${message}` });
    });
});

// Also convert any uncaught error/rejection into a typed failure message so the
// host never sees an unhandled worker error (Req 10.9).
ctx.addEventListener("error", (e) => {
  e.preventDefault();
  post({ type: "error", code: "encoder-failure", message: "Encoding failed: worker error" });
});
ctx.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  post({ type: "error", code: "encoder-failure", message: "Encoding failed: worker rejection" });
});
