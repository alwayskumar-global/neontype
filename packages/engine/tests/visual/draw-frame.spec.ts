import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Golden-image tests for `drawFrame` (Task 12.3).
 *
 * For every committed fixture under `tests/visual/fixtures/`, this spec loads
 * the visual harness page, waits for the self-hosted fonts to settle, feeds the
 * precomputed `FrameState` to `window.render` (which calls `drawFrame`), and
 * compares a screenshot of the canvas element against a committed golden PNG.
 *
 * The spec deliberately does NOT call `computeFrameState` or `renderFrame`: it
 * only exercises the thin `drawFrame` painter via the committed fixtures, so a
 * golden mismatch points squarely at a rendering change. The first run writes
 * the goldens; subsequent runs must match with at most a 0.001 pixel-diff ratio.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");

// The window globals the harness page (tests/visual/app/main.ts) exposes.
declare global {
  interface Window {
    fontsReady: boolean;
    render: (state: unknown) => void;
  }
}

const fixtureFiles = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

for (const fileName of fixtureFiles) {
  const name = fileName.replace(/\.json$/, "");
  const fixtureJson: unknown = JSON.parse(
    readFileSync(join(fixturesDir, fileName), "utf8"),
  );

  test(`drawFrame golden — ${name}`, async ({ page }) => {
    await page.goto("http://localhost:5173");

    // Block until the harness reports both fonts have loaded, so the canvas is
    // rasterised with the intended glyphs rather than a fallback.
    await page.waitForFunction(() => window.fontsReady === true);

    await page.evaluate((fixture) => window.render(fixture), fixtureJson);

    const canvas = page.locator("#canvas");
    const screenshot = await canvas.screenshot();

    expect(screenshot).toMatchSnapshot(`${name}.png`, {
      maxDiffPixelRatio: 0.001,
    });
  });
}
