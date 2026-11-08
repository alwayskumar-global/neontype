import { test, expect } from "@playwright/test";

/**
 * Group-1 scaffold smoke (dev server). Asserts the shell renders and a module
 * Worker built from a bundler URL round-trips a message (proving the worker
 * wiring). CSP is asserted separately against the production preview in
 * tests-csp/csp.spec.ts (the dev server runs with no CSP meta — HMR needs
 * inline/eval).
 */

declare global {
  interface Window {
    __studioWorkerProbe?: () => Promise<boolean>;
  }
}

test("scaffold renders and a module worker round-trips", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  const probeOk = await page.evaluate(async () => {
    const fn = window.__studioWorkerProbe;
    return fn ? await fn() : false;
  });
  expect(probeOk, "module worker round-trip").toBe(true);
});
