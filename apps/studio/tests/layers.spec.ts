import { test, expect, type Page } from "@playwright/test";
import { canvasHash, gotoStudio, inspectorPanel, layerField, layersPanel, previewCanvas, seek } from "./helpers.js";
/**
 * Layers panel (Requirement 3): add, edit text, delete, reorder (draw order follows
 * list order), per-layer fields, invalid edits rejected, and user text rendered as
 * text, never as HTML.
 */
const rows = (page: Page) => layersPanel(page).getByRole("listitem");
const selectRow = (page: Page, i: number) => rows(page).nth(i).getByRole("button").first().click();
/** Counts pixels near one colour on the preview canvas. */
async function countColor(page: Page, rgb: [number, number, number]): Promise<number> {
  return await previewCanvas(page).evaluate((el, [r, g, b]) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) n++;
    }
    return n;
  }, rgb);
}
test("add, edit the text, and delete a layer", async ({ page }) => {
  await gotoStudio(page, false);
  await expect(rows(page)).toHaveCount(1);
  await layersPanel(page).getByRole("button", { name: "Add layer" }).click();
  await expect(rows(page)).toHaveCount(2);
  await selectRow(page, 1);
  await layerField(page, "Text").fill("Second line");
  await expect(rows(page).nth(1).getByRole("button", { name: "Second line", exact: true })).toBeVisible();
  await rows(page).nth(1).getByRole("button", { name: /^Delete / }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(layersPanel(page).getByRole("button", { name: "Second line", exact: true })).toHaveCount(0);
});
test("per-layer fields are written and read back", async ({ page }) => {
  await gotoStudio(page, false);
  const fonts = layerField(page, "Font").getByRole("option");
  expect((await fonts.allInnerTexts()).sort()).toEqual(["Noto Sans", "Noto Sans Tamil"]);
  await seek(page, 1.5);
  const before = await canvasHash(page);
  await layerField(page, "Font").selectOption("Noto Sans Tamil");
  await layerField(page, "Weight").selectOption("400");
  await layerField(page, "Size").fill("90");
  await layerField(page, "Colour").fill("#00ff00");
  await inspectorPanel(page).getByRole("radio", { name: "Right" }).click();
  await layerField(page, "X").fill(String(300 / 1280));
  await layerField(page, "Y").fill(String(200 / 720));
  await layerField(page, "Start (s)").fill("0.5");
  await layerField(page, "Duration (s)").fill("2");
  await expect(layerField(page, "Font")).toHaveValue("Noto Sans Tamil");
  await expect(layerField(page, "Weight")).toHaveValue("400");
  await expect(layerField(page, "Size")).toHaveValue("90");
  await expect(layerField(page, "Colour")).toHaveValue("#00ff00");
  await expect(inspectorPanel(page).getByRole("radio", { name: "Right" })).toBeChecked();
  await expect(layerField(page, "X")).toHaveValue(String(Number((300 / 1280).toFixed(4))));
  await expect(layerField(page, "Y")).toHaveValue(String(Number((200 / 720).toFixed(4))));
  await expect(layerField(page, "Start (s)")).toHaveValue("0.5");
  await expect(layerField(page, "Duration (s)")).toHaveValue("2");
  await expect.poll(async () => (await canvasHash(page)) === before).toBe(false);
});
test("an invalid edit is rejected and the field keeps its value", async ({ page }) => {
  await gotoStudio(page, false);
  const size = await layerField(page, "Size").inputValue();
  await layerField(page, "Size").fill("0");
  await expect(layerField(page, "Size")).toHaveValue(size);
  await layerField(page, "Size").fill("5000");
  await expect(layerField(page, "Size")).toHaveValue(size);
  const dur = await layerField(page, "Duration (s)").inputValue();
  await layerField(page, "Duration (s)").fill("99");
  await expect(layerField(page, "Duration (s)")).toHaveValue(dur);
});
test("draw order follows the list order", async ({ page }) => {
  await gotoStudio(page, false);
  const RED: [number, number, number] = [255, 0, 0];
  const BLUE: [number, number, number] = [0, 0, 255];
  // Layer 1: red "W" at a fixed spot. Layer 2: blue "W" at the same spot, listed after it.
  const setup = async (index: number, color: string): Promise<void> => {
    await selectRow(page, index);
    await layerField(page, "Text").fill("W");
    await layerField(page, "Size").fill("400");
    await layerField(page, "Colour").fill(color);
    await inspectorPanel(page).getByRole("radio", { name: "Center" }).click();
    await layerField(page, "X").fill("0.5");
    await layerField(page, "Y").fill("0.5");
    await layerField(page, "Start (s)").fill("0");
    await layerField(page, "Duration (s)").fill("5");
  };
  await setup(0, "#ff0000");
  await layersPanel(page).getByRole("button", { name: "Add layer" }).click();
  await setup(1, "#0000ff");
  // Scrub to a settled time, past every effect.
  await seek(page, 4);
  await expect.poll(() => countColor(page, BLUE)).toBeGreaterThan(500);
  const blueOnTop = { red: await countColor(page, RED), blue: await countColor(page, BLUE) };
  expect(blueOnTop.blue, "the later layer draws on top").toBeGreaterThan(blueOnTop.red);
  // Move the blue layer up: the red layer is now later in the list, so it draws on top.
  await rows(page).nth(1).getByRole("button", { name: /^Move .* up$/ }).click();
  await expect.poll(() => countColor(page, RED)).toBeGreaterThan(500);
  const redOnTop = { red: await countColor(page, RED), blue: await countColor(page, BLUE) };
  expect(redOnTop.red, "after reordering, the red layer draws on top").toBeGreaterThan(redOnTop.blue);
  // The first row's Move up and the last row's Move down are disabled.
  await expect(rows(page).first().getByRole("button", { name: /^Move .* up$/ })).toBeDisabled();
  await expect(rows(page).last().getByRole("button", { name: /^Move .* down$/ })).toBeDisabled();
});
test("layer text that looks like markup is rendered as text", async ({ page }) => {
  await gotoStudio(page, false);
  const markup = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
  await layerField(page, "Text").fill(markup);
  await expect(layersPanel(page).getByRole("button", { name: markup, exact: true })).toBeVisible();
  const state = await page.evaluate(() => ({
    imgs: document.querySelectorAll("img:not([alt=\"NeonType\"])").length,
    pwned: (window as unknown as { __pwned?: number }).__pwned ?? null,
  }));
  expect(state).toEqual({ imgs: 0, pwned: null });
});
