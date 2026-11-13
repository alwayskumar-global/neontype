import { test, expect, type Page } from "@playwright/test";
import { exportAs, exportFormat, gotoStudio, progressSeen, settingsPanel, shrinkProject, watchExportProgress } from "./helpers.js";
import { summarizeWebp, VP8X_ALPHA, VP8X_ANIMATION } from "./webp.js";
/**
 * Animated WebP in the export dialog (task: offer WebP). Gated on the exporters capability result like the other
 * formats; a finished export is a real file with the RIFF/WEBP header and the VP8X animation flag. Role, label,
 * and text locators only; `page.evaluate` reads the DEV hook the dialog sets and installs a progress observer.
 */
interface LastExport {
  fileName: string;
  size: number;
  head: number[];
}
const ascii = (b: number[]): string => String.fromCharCode(...b);
const lastExport = (page: Page): Promise<LastExport> =>
  page.evaluate(() => (window as unknown as { __lastExport?: LastExport }).__lastExport as LastExport);
async function openDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
}
test("WebP is offered next to the other formats and is enabled when the browser can encode it", async ({ page }) => {
  await gotoStudio(page, true);
  await openDialog(page);
  for (const format of ["mp4", "png-sequence", "gif", "webp"] as const) {
    await expect(exportFormat(page, format)).toBeEnabled();
  }
});
test("WebP is disabled with a reason when the browser cannot encode a still WebP", async ({ page }) => {
  await page.addInitScript(() => {
    // Make image/webp encodes fall back to PNG, as a browser without WebP encoding does.
    const original = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (this: OffscreenCanvas, options?: ImageEncodeOptions) {
      return original.call(this, options?.type === "image/webp" ? { ...options, type: "image/png" } : options);
    };
  });
  await gotoStudio(page, true);
  await openDialog(page);
  const webp = exportFormat(page, "webp");
  await expect(webp).toBeDisabled();
  await expect(webp).toContainText("still image/webp encode unavailable");
  await expect(exportFormat(page, "gif")).toBeEnabled();
});
/** Clicks Download and returns the downloaded file's suggested name and bytes. */
async function download(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Download" }).click()]);
  const stream = await dl.createReadStream();
  const parts: Uint8Array[] = [];
  for await (const part of stream as AsyncIterable<Uint8Array>) parts.push(part);
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.byteLength;
  }
  return { name: dl.suggestedFilename(), bytes };
}
test("exports a shortened demo as an animated WebP: header, animation flag, progress UI, and the downloaded file", async ({ page }) => {
  await gotoStudio(page, true);
  await shrinkProject(page, "1");
  await openDialog(page);
  const dialog = page.getByRole("dialog", { name: "Export" });
  // Watch for the progress bar and its values, however briefly it shows.
  await watchExportProgress(page);
  await exportAs(page, "webp");
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 30_000 });
  const progress = await progressSeen(page);
  expect(progress.appeared, "the progress bar showed while exporting").toBe(true);
  const info = await lastExport(page);
  expect(info.fileName).toMatch(/\.webp$/);
  expect(info.size).toBeGreaterThan(0);
  expect(ascii(info.head.slice(0, 4))).toBe("RIFF");
  expect(ascii(info.head.slice(8, 12))).toBe("WEBP");
  expect(ascii(info.head.slice(12, 16))).toBe("VP8X");
  expect(info.head[20]! & 0x02, "the VP8X animation flag").toBe(0x02);
  expect(info.head[20]! & 0x10, "an opaque background clears the alpha flag").toBe(0);
  const file = await download(page);
  expect(file.name).toMatch(/\.webp$/);
  const webp = summarizeWebp(file.bytes);
  expect([webp.riff, webp.webp], "RIFF....WEBP").toEqual([true, true]);
  expect(webp.chunks).toContain("VP8X");
  expect(webp.vp8xFlags! & VP8X_ANIMATION, "the ANIM flag").toBe(VP8X_ANIMATION);
  expect(webp.chunks.filter((c) => c === "ANMF").length, "at least two frames").toBeGreaterThanOrEqual(2);
});
test("a transparent project exports a WebP with the VP8X alpha flag set", async ({ page }) => {
  await gotoStudio(page, true);
  await shrinkProject(page, "0.3");
  await settingsPanel(page).getByRole("switch", { name: "Transparent" }).check();
  await openDialog(page);
  const dialog = page.getByRole("dialog", { name: "Export" });
  await exportAs(page, "webp");
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 30_000 });
  const info = await lastExport(page);
  expect(info.head[20]! & 0x12, "animation and alpha flags").toBe(0x12);
  const file = await download(page);
  expect(file.name).toMatch(/\.webp$/);
  const webp = summarizeWebp(file.bytes);
  expect(webp.vp8xFlags! & VP8X_ALPHA, "the ALPHA flag").toBe(VP8X_ALPHA);
});
test("after a WebP export, Export again returns to the format choices", async ({ page }) => {
  await gotoStudio(page, true);
  await shrinkProject(page, "0.3");
  await openDialog(page);
  const dialog = page.getByRole("dialog", { name: "Export" });
  await exportAs(page, "webp");
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Export another" }).click();
  await expect(exportFormat(page, "webp")).toBeVisible();
});
