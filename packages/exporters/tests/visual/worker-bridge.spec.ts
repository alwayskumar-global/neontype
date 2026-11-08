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
  }
}

test("worker and main-thread paths produce byte-identical frames", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await page.waitForFunction(() => typeof window.runWorkerExport === "function");

  const worker = await page.evaluate(() => window.runWorkerExport());
  const main = await page.evaluate(() => window.runMainExport());

  expect(worker.ok, "worker export succeeded").toBe(true);
  expect(main.ok, "main-thread export succeeded").toBe(true);
  expect(worker.bytes.length).toBeGreaterThan(0);
  expect(worker.bytes.length).toBe(main.bytes.length);
  expect(worker.bytes).toEqual(main.bytes);
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
