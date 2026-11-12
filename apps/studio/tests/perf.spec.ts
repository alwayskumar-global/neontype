import { test, expect } from "@playwright/test";
import { gotoStudio } from "./helpers.js";
/**
 * Performance measurement (Requirement 13). Plays the 1280x720, 5-layer fixture (one
 * effect per layer) through the preview render path for a fixed 10 s window and reads the
 * mean and 95th-percentile frame interval from requestAnimationFrame timestamps
 * (playback/perf.ts, via the DEV probe). The numbers are reported on every run.
 *
 * PASS: mean <= (1000 / fps) ms and p95 <= 1.5 x (1000 / fps) ms, each multiplied by a
 * documented CI tolerance. The tolerance is 1.5 by default: shared CI runners are slower and
 * noisier than the "mid-range laptop" the requirement names, and a single descheduled frame
 * must not fail the run. Set PERF_TOLERANCE=1 on a laptop for the authoritative reading.
 */
const FPS = 30;
const WINDOW_SECONDS = 10;
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const TOLERANCE = Number(env?.PERF_TOLERANCE ?? "1.5");
type Stats = { mean: number; p95: number; count: number };
test("the preview sustains the project fps for 10 s (1280x720, 5 layers, one effect each)", async ({ page }) => {
  test.setTimeout(60_000);
  await gotoStudio(page, true);
  const stats = await page.evaluate(async (seconds) => {
    const probe = (window as unknown as { __studioPerfProbe?: (withBlur: boolean, seconds?: number) => Promise<Stats> }).__studioPerfProbe;
    if (!probe) throw new Error("the DEV perf probe is not installed");
    return await probe(false, seconds);
  }, WINDOW_SECONDS);
  const budget = 1000 / FPS;
  const meanLimit = budget * TOLERANCE;
  const p95Limit = budget * 1.5 * TOLERANCE;
  const report = `perf: mean ${stats.mean.toFixed(2)} ms (limit ${meanLimit.toFixed(2)}), p95 ${stats.p95.toFixed(2)} ms (limit ${p95Limit.toFixed(2)}), ${stats.count} frames, tolerance x${TOLERANCE}`;
  console.log(report);
  test.info().annotations.push({ type: "perf", description: report });
  expect(stats.count, "the window recorded frames").toBeGreaterThan(100);
  expect(stats.mean, report).toBeLessThanOrEqual(meanLimit);
  expect(stats.p95, report).toBeLessThanOrEqual(p95Limit);
});
