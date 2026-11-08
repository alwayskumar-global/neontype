import { test, expect } from "@playwright/test";

/**
 * Worker-bridge parity + abort (Req 9.5, 9.7, 9.8, 10.9).
 *
 * The SAME recording driver runs an identical tiny project through the WORKER
 * path (dispatchExport, since the harness runtime has Worker + OffscreenCanvas)
 * and INLINE on the main thread. The produced frame bytes must be byte-identical
 * (Req 9.7, 9.8). A second test aborts a longer export through the worker path
 * and asserts it ends with code "cancelled" (Req 9.5); because the host always
 * terminates the worker on completion, a follow-up export still succeeds, which
 * confirms the bridge tore down cleanly.
 */

declare global {
  interface Window {
    runWorkerExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runMainExport: () => Promise<{ ok: boolean; bytes: number[]; code?: string }>;
    runWorkerAbort: () => Promise<{ ok: boolean; code?: string }>;
    renderBlurFrameNoWrapper: () => number[];
    renderBlurFrameWithWrapper: () => { bytes: number[]; blurFilterSetOnReal: boolean };
  }
}

test("worker and main-thread paths produce byte-identical frames through the blur wrapper", async ({
  page,
}) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runWorkerExport === "function");

  // Both paths run the recording driver, which renders through the shared
  // FrameRenderer (FilterStrippingContext + R14 scaling). Frames must match.
  const worker = await page.evaluate(() => window.runWorkerExport());
  const main = await page.evaluate(() => window.runMainExport());

  expect(worker.ok, "worker export succeeded").toBe(true);
  expect(main.ok, "main-thread export succeeded").toBe(true);
  expect(worker.bytes.length).toBeGreaterThan(0);
  expect(worker.bytes.length).toBe(main.bytes.length);
  expect(worker.bytes).toEqual(main.bytes);

  // The blurred segment really goes through the wrapper: the wrapped render
  // differs from a wrapper-less native render (blur is applied by the exporter),
  // and the real context's `filter` is never set to a blur value (Req 8.1-8.4).
  const noWrapper = await page.evaluate(() => window.renderBlurFrameNoWrapper());
  const withWrapper = await page.evaluate(() => window.renderBlurFrameWithWrapper());

  expect(withWrapper.blurFilterSetOnReal, "real ctx.filter never set to a blur").toBe(false);
  expect(withWrapper.bytes.length).toBe(noWrapper.length);
  // They must differ somewhere (blur changes pixels), proving the wrapper acted.
  let differs = false;
  for (let i = 0; i < noWrapper.length; i++) {
    if (noWrapper[i] !== withWrapper.bytes[i]) {
      differs = true;
      break;
    }
  }
  expect(differs, "wrapped render differs from unwrapped where blur applies").toBe(true);
});

test("aborting a worker export ends with cancelled and leaves the bridge reusable", async ({
  page,
}) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runWorkerAbort === "function");

  const aborted = await page.evaluate(() => window.runWorkerAbort());
  expect(aborted.ok, "aborted export did not succeed").toBe(false);
  expect(aborted.code).toBe("cancelled");

  // A fresh export still works -> the aborted worker was terminated/cleaned up.
  const after = await page.evaluate(() => window.runWorkerExport());
  expect(after.ok, "subsequent worker export succeeded").toBe(true);
  expect(after.bytes.length).toBeGreaterThan(0);
});
