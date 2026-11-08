/**
 * Host dispatch (Req 9.1, 9.5, 9.7, 9.8, 10.9).
 *
 * Chooses the execution path and bridges the non-cloneable bits that cannot
 * cross the worker boundary:
 *   - When `Worker` AND `OffscreenCanvas` both exist, run on a worker built with
 *     the standard bundler-friendly `new URL("./worker-entry.ts", import.meta.url)`
 *     construction. The host posts `start`, relays each `progress` message to the
 *     caller's `onProgress` (so callbacks run on the MAIN thread), posts `abort`
 *     when the caller's `AbortSignal` fires, resolves on `result`, maps `error`
 *     to a typed `encoder-failure`, and ALWAYS terminates the worker.
 *   - Otherwise fall back to running the SAME driver inline on the main thread,
 *     byte-identical output (Req 9.7, 9.8).
 *
 * A thrown/own-error inside the worker arrives as an `error` message and becomes
 * an `ExportResult` failure; it is never surfaced as an unhandled worker error.
 */

import type { ExportResult, ExportProgress } from "../types.js";
import { fail } from "../errors.js";
import type { DriverArgs } from "./driver.js";
import { resolveDriver } from "./driver.js";
import type { MainToWorker, WorkerToMain } from "./protocol.js";

/** Inputs for a dispatched export. */
export interface DispatchArgs extends DriverArgs {
  /** Which registered driver to run (worker resolves the same id). */
  driverId: string;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

/** True when the worker path is available in this runtime. */
export function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

/** Runs the export on a worker, bridging progress/abort/result/error. */
function runOnWorker(args: DispatchArgs): Promise<ExportResult> {
  return new Promise<ExportResult>((resolve) => {
    const worker = new Worker(new URL("./worker-entry.ts", import.meta.url), { type: "module" });

    let settled = false;
    const finish = (result: ExportResult): void => {
      if (settled) return;
      settled = true;
      if (args.signal) args.signal.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(result);
    };

    const onAbort = (): void => {
      const abortMsg: MainToWorker = { type: "abort" };
      worker.postMessage(abortMsg);
    };

    worker.addEventListener("message", (event: MessageEvent<WorkerToMain>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        args.onProgress?.({ fraction: msg.fraction, frame: msg.frame, frameCount: msg.frameCount });
      } else if (msg.type === "result") {
        finish(msg.result);
      } else if (msg.type === "error") {
        finish(fail("encoder-failure", msg.message));
      }
    });
    worker.addEventListener("error", () => {
      finish(fail("encoder-failure", "Encoding failed: worker error"));
    });

    if (args.signal) {
      if (args.signal.aborted) {
        onAbort();
      } else {
        args.signal.addEventListener("abort", onAbort);
      }
    }

    const start: MainToWorker = {
      type: "start",
      driverId: args.driverId,
      format: args.format,
      project: args.project,
      options: args.options,
      limits: args.limits,
    };
    // Transfer the decoded-PCM buffers (zero-copy) rather than clone them. After
    // this the main thread's copies are detached; it must not reuse them.
    const transfer: Transferable[] = [];
    const pcm = args.options.audioPcm;
    if (pcm) {
      for (const ch of pcm.channels) transfer.push(ch.buffer as ArrayBuffer);
    }
    worker.postMessage(start, transfer);
  });
}

/** Runs the driver inline on the main thread (fallback path). */
function runOnMainThread(args: DispatchArgs): Promise<ExportResult> {
  const driver = resolveDriver(args.driverId);
  if (!driver) {
    return Promise.resolve(fail("encoder-failure", `Unknown driver: ${args.driverId}`));
  }
  const isAborted = (): boolean => args.signal?.aborted ?? false;
  return driver(
    { format: args.format, project: args.project, options: args.options, limits: args.limits },
    (p) => args.onProgress?.(p),
    isAborted,
  ).catch((err: unknown) => {
    const message = err instanceof Error ? err.name : "export error";
    return fail("encoder-failure", `Encoding failed: ${message}`);
  });
}

/**
 * Dispatches an export to the worker when supported, else the main thread.
 * Never throws; always returns an `ExportResult`.
 */
export function dispatchExport(args: DispatchArgs): Promise<ExportResult> {
  return canUseWorker() ? runOnWorker(args) : runOnMainThread(args);
}
