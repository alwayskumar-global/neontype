import { test, expect, type Page } from "@playwright/test";
import { gotoStudio, previewCanvas } from "./helpers.js";

/**
 * Canvas direct manipulation (Requirement 3.8-3.20, 16): click selects the topmost
 * layer, drag moves its anchor (X/Y fields change and the drawn text follows),
 * Arrow keys nudge 1 / 10 px, Ctrl/Cmd+Z undoes each change in one step, and the
 * selection outline (hit bounds) agrees with the drawn text.
 */


async function enterAtT3(page: Page): Promise<void> {
  await gotoStudio(page, true);
  await page.getByLabel("Scrub").fill("3");
  await page.waitForTimeout(80);
}

const field = (page: Page, name: "X" | "Y") => page.getByLabel(name, { exact: true });
const num = async (page: Page, name: "X" | "Y"): Promise<number> => Number(await field(page, name).inputValue());

interface Box { minX: number; maxX: number; minY: number; maxY: number }

/** Pixel bbox of one layer colour on the preview canvas, in canvas px. */
async function colorBBox(page: Page, rgb: [number, number, number], tol = 60): Promise<Box> {
  return await previewCanvas(page).evaluate((el, { rgb, tol }) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, maxX = -1, minY = c.height, maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] > 40 && Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) {
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { minX, maxX, minY, maxY };
  }, { rgb, tol });
}
const TITLE: [number, number, number] = [0xff, 0xcc, 0x00];

async function canvasRect(page: Page) {
  return await previewCanvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
  });
}

/** Client coordinates of a canvas-px point. */
async function toClient(page: Page, x: number, y: number) {
  const r = await canvasRect(page);
  return { x: r.left + (x * r.width) / r.cw, y: r.top + (y * r.height) / r.ch, scale: r.width / r.cw };
}

async function titleCenterClient(page: Page) {
  const b = await colorBBox(page, TITLE);
  return { box: b, ...(await toClient(page, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)) };
}

test("dragging the title changes its anchor and the drawn text follows", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const y0 = await num(page, "Y");
  const { box: before, x, y, scale } = await titleCenterClient(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 25, { steps: 4 });
  await page.mouse.move(x + 100, y + 50, { steps: 4 });
  await page.mouse.up();

  const dx = 100 / scale;
  const dy = 50 / scale;
  expect(Math.abs((await num(page, "X")) - (x0 + dx))).toBeLessThanOrEqual(1);
  expect(Math.abs((await num(page, "Y")) - (y0 + dy))).toBeLessThanOrEqual(1);

  const after = await colorBBox(page, TITLE);
  expect(Math.abs(after.minX - before.minX - dx)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.minY - before.minY - dy)).toBeLessThanOrEqual(2);
});

test("Shift keeps only the dominant axis while dragging", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const y0 = await num(page, "Y");
  const { x, y, scale } = await titleCenterClient(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(x + 80, y + 20, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect(Math.abs((await num(page, "X")) - (x0 + 80 / scale))).toBeLessThanOrEqual(1);
  expect(await num(page, "Y")).toBe(y0);
});

test("the anchor is clamped to the canvas when dragged far outside", async ({ page }) => {
  await enterAtT3(page);
  const { x, y } = await titleCenterClient(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 5000, y - 5000, { steps: 4 });
  await page.mouse.up();
  expect(await num(page, "X")).toBe(1280);
  expect(await num(page, "Y")).toBe(0);
});

test("arrow keys nudge the selected layer 1 px, Shift 10 px", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const y0 = await num(page, "Y");
  // A click on the title selects it and focuses the canvas (no drag, no change).
  const { x, y } = await titleCenterClient(page);
  await page.mouse.click(x, y);
  expect(await num(page, "X")).toBe(x0);
  await page.keyboard.press("ArrowRight");
  expect(await num(page, "X")).toBe(x0 + 1);
  await page.keyboard.press("Shift+ArrowRight");
  expect(await num(page, "X")).toBe(x0 + 11);
  await page.keyboard.press("ArrowDown");
  expect(await num(page, "Y")).toBe(y0 + 1);
  await page.keyboard.press("Shift+ArrowUp");
  expect(await num(page, "Y")).toBe(y0 - 9);
});

test("clicking a layer selects it; clicking empty canvas leaves the selection", async ({ page }) => {
  await enterAtT3(page);
  const titleBtn = page.getByRole("button", { name: "Motion Text" });
  const subtitleBtn = page.getByRole("button", { name: "built in the browser" });
  await expect(titleBtn).toHaveAttribute("aria-pressed", "true");
  // Subtitle (near-white, y=520) is topmost where it is.
  const sub = await colorBBox(page, [0xe4, 0xe8, 0xee], 20);
  const p = await toClient(page, (sub.minX + sub.maxX) / 2, (sub.minY + sub.maxY) / 2);
  await page.mouse.click(p.x, p.y);
  await expect(subtitleBtn).toHaveAttribute("aria-pressed", "true");
  // Empty canvas corner: selection unchanged.
  const corner = await toClient(page, 4, 4);
  await page.mouse.click(corner.x, corner.y);
  await expect(subtitleBtn).toHaveAttribute("aria-pressed", "true");
});

test("Ctrl/Cmd+Z restores each canvas change in one step", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const y0 = await num(page, "Y");
  const { x, y } = await titleCenterClient(page);

  // One drag (many pointer moves) = ONE undo step.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 10, y + i * 4);
  await page.mouse.up();
  const draggedX = await num(page, "X");
  expect(draggedX).not.toBe(x0);

  // Two nudges = two steps.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await num(page, "X")).toBe(draggedX + 2);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await num(page, "X")).toBe(draggedX + 1);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await num(page, "X")).toBe(draggedX);
  await page.keyboard.press("ControlOrMeta+z"); // the whole drag, in one step
  expect(await num(page, "X")).toBe(x0);
  expect(await num(page, "Y")).toBe(y0);
  await page.keyboard.press("ControlOrMeta+z"); // nothing left: no-op, no error
  expect(await num(page, "X")).toBe(x0);
});

test("Escape during a drag cancels it and adds no undo step", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const { x, y } = await titleCenterClient(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 40, { steps: 4 });
  expect(await num(page, "X")).not.toBe(x0); // live
  await page.keyboard.press("Escape");
  expect(await num(page, "X")).toBe(x0);
  await page.mouse.up();
  expect(await num(page, "X")).toBe(x0);
  await page.keyboard.press("ControlOrMeta+z"); // history is empty: still x0
  expect(await num(page, "X")).toBe(x0);
});

test("Ctrl/Cmd+Z does nothing while the export dialog is open", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const { x, y } = await titleCenterClient(page);
  await page.mouse.click(x, y);
  await page.keyboard.press("ArrowRight");
  expect(await num(page, "X")).toBe(x0 + 1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export" })).toBeHidden();
  expect(await num(page, "X")).toBe(x0 + 1);
});

test("Ctrl/Cmd+Z in a text field is left to the browser (project not undone)", async ({ page }) => {
  await enterAtT3(page);
  const x0 = await num(page, "X");
  const { x, y } = await titleCenterClient(page);
  await page.mouse.click(x, y);
  await page.keyboard.press("ArrowRight");
  await field(page, "X").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await num(page, "X")).toBe(x0 + 1);
});

test("the selection outline agrees with the drawn text (hit bounds vs pixel bbox drift guard)", async ({ page }) => {
  await enterAtT3(page);
  const { box, scale } = await titleCenterClient(page);
  const r = await canvasRect(page);
  const outline = await page.locator(".selection-outline").boundingBox();
  expect(outline, "outline is visible for the selected layer").not.toBeNull();
  // Ink bbox in client px.
  const ink = {
    left: r.left + box.minX * scale, right: r.left + (box.maxX + 1) * scale,
    top: r.top + box.minY * scale, bottom: r.top + (box.maxY + 1) * scale,
  };
  const o = { left: outline!.x, right: outline!.x + outline!.width, top: outline!.y, bottom: outline!.y + outline!.height };
  const fontSize = 120 * scale; // title fontSize in client px
  // The hit box is the layout (advance + ascent/descent) box, so it CONTAINS the ink
  // within a small tolerance, and its horizontal edges sit within the glyph side
  // bearings of the ink. Drift (e.g. fallback-font metrics) breaks these bounds.
  const eps = 2 * scale;
  expect(o.left).toBeLessThanOrEqual(ink.left + eps);
  expect(o.right).toBeGreaterThanOrEqual(ink.right - eps);
  expect(o.top).toBeLessThanOrEqual(ink.top + eps);
  expect(o.bottom).toBeGreaterThanOrEqual(ink.bottom - eps);
  expect(ink.left - o.left).toBeLessThanOrEqual(0.2 * fontSize);
  expect(o.right - ink.right).toBeLessThanOrEqual(0.2 * fontSize);
  expect(ink.top - o.top).toBeLessThanOrEqual(0.6 * fontSize);
  expect(o.bottom - ink.bottom).toBeLessThanOrEqual(0.6 * fontSize);
});
