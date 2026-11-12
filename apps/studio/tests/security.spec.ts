import { test, expect, type Page } from "@playwright/test";
import { gotoStudio, layersPanel } from "./helpers.js";
/**
 * Security (Requirement 11), against the dev server. The strict CSP and its violations are
 * verified against the production build in tests-csp/. Here: opened files are validated before
 * use, user text never becomes markup, and a session makes no request off this origin.
 */
const ORIGIN = "http://localhost:5273";
/** Hands a file to the "Open project file" input, as a user choosing it would. */
async function openFile(page: Page, content: string | number, name: string): Promise<void> {
  await page.getByLabel("Open project file").evaluate(
    (el, { content, name }) => {
      const input = el as HTMLInputElement;
      const body = typeof content === "number" ? new Uint8Array(content) : content;
      const file = new File([body], name, { type: "application/json" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { content, name },
  );
}
const project = (text: string): string =>
  JSON.stringify({
    schemaVersion: 1,
    canvas: { width: 640, height: 360, fps: 30, durationSeconds: 2 },
    background: "#101018",
    seed: 1,
    layers: [
      {
        id: "a", text, tracks: [], effectInstances: [], fontFamily: "Noto Sans", fontSize: 48, fontWeight: "700",
        fill: "#ffffff", align: "center", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 2, anchor: { x: 320, y: 180 },
      },
    ],
  });
test("a project file whose text looks like markup loads as plain text", async ({ page }) => {
  await gotoStudio(page, false);
  const markup = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
  await openFile(page, project(markup), "markup.json");
  await expect(layersPanel(page).getByRole("button", { name: markup })).toBeVisible();
  const state = await page.evaluate(() => ({
    imgs: document.querySelectorAll("img").length,
    pwned: (window as unknown as { __pwned?: number }).__pwned ?? null,
  }));
  expect(state).toEqual({ imgs: 0, pwned: null });
});
test("an oversized file is rejected before it is read, and the project is unchanged", async ({ page }) => {
  await gotoStudio(page, false);
  await openFile(page, 5 * 1024 * 1024 + 1, "huge.json");
  await expect(page.getByRole("alert")).toContainText(/could not open the project/i);
  await expect(layersPanel(page).getByRole("button", { name: "Your Title" })).toBeVisible();
});
test("a file that is JSON but not a valid project is rejected, and the project is unchanged", async ({ page }) => {
  await gotoStudio(page, false);
  await openFile(page, JSON.stringify({ schemaVersion: 99, layers: "no" }), "wrong.json");
  await expect(page.getByRole("alert")).toContainText(/could not open the project/i);
  await expect(layersPanel(page).getByRole("button", { name: "Your Title" })).toBeVisible();
});
test("a session makes no request off this origin", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== ORIGIN) external.push(url);
  });
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).host !== "localhost:5273") external.push(ws.url());
  });
  await gotoStudio(page, true);
  await page.getByRole("button", { name: "Add layer" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await page.getByRole("button", { name: /Export gif/ }).click();
  await expect(page.getByRole("progressbar", { name: "Export progress" }).or(page.getByRole("button", { name: "Download" }))).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).or(page.getByRole("button", { name: "Download" })).click();
  expect(external).toEqual([]);
});
