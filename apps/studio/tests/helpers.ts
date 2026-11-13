import { expect, type Locator, type Page } from "@playwright/test";
import { frameFromTimecode, totalFrames } from "./timecode.js";
/**
 * Shared studio helpers. Locators are role, label, and text only. The few
 * `page.evaluate` calls read document-wide state (canvas pixels).
 */
/** The preview canvas (its accessible name starts with "Preview canvas"). */
export function previewCanvas(page: Page): Locator {
  return page.getByLabel(/^Preview canvas/);
}
/**
 * Shared studio entry: load the app (landing first), then open the studio via a
 * hero CTA. `demo` true clicks "Open the studio" (demo project, visible
 * playhead); false clicks "Start blank" (default project). Resolves when the
 * studio canvas is visible.
 */
export async function gotoStudio(page: Page, demo = true): Promise<void> {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("heading", { name: "Animated titles, made in your browser." })).toBeVisible();
  const label = demo ? "Open the studio" : "Start blank";
  await page.getByRole("button", { name: label }).first().click();
  await expect(previewCanvas(page)).toBeVisible();
}
/** The canvas as a data URL (any pixel change changes it). */
export async function canvasHash(page: Page): Promise<string> {
  return await previewCanvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}
/** True for a pressed toggle button (`aria-pressed`) or a checked checkbox. */
export async function isOn(control: Locator): Promise<boolean> {
  const pressed = await control.getAttribute("aria-pressed");
  if (pressed !== null) return pressed === "true";
  return await control.isChecked();
}
/** The project settings panel (the "PROJECT" region of the generated editor). */
export function settingsPanel(page: Page): Locator {
  return page.getByRole("region", { name: "PROJECT" });
}
/** The layers panel (the "LAYERS" region). */
export function layersPanel(page: Page): Locator {
  return page.getByRole("region", { name: "LAYERS" });
}
/**
 * The inspector: the right-hand column of the generated editor, which holds the selected layer's fields and
 * its effects. It has no accessible name of its own, so it is found as the complementary landmark that
 * carries the "no layer selected" text.
 */
export function inspectorPanel(page: Page): Locator {
  return page.getByRole("complementary").filter({ hasText: "Pick a layer on the left" });
}
/** The effects of the selected layer live in the inspector (under the "EFFECTS ON THIS LAYER" heading). */
export function effectsPanel(page: Page): Locator {
  return inspectorPanel(page);
}
/** The project's frame rate and duration, read from the settings fields. */
async function projectTiming(page: Page): Promise<{ fps: number; duration: number }> {
  const fps = Number(await settingsPanel(page).getByLabel("Frame rate").inputValue());
  const duration = Number(await settingsPanel(page).getByLabel("Duration in seconds").inputValue());
  return { fps, duration };
}
/**
 * Reads the playhead as { frame, total, time }. The frame comes from the "mm:ss:ff" timecode and the project's
 * frame rate, the total from the project's duration and frame rate, and the time (seconds) from the timeline's
 * Playhead slider, because a timecode only has frame resolution.
 */
export async function readReadout(page: Page): Promise<{ frame: number; total: number; time: number }> {
  const text = (await page.getByLabel("Timecode").innerText()).trim();
  const { fps, duration } = await projectTiming(page);
  const total = totalFrames(duration, fps);
  const time = Number((Number(await page.getByRole("slider", { name: "Playhead" }).getAttribute("aria-valuenow"))).toFixed(2));
  return { frame: frameFromTimecode(text, fps, total), total, time };
}
/**
 * Moves the playhead to `seconds` with the timeline ruler: a click at that point (then Arrow keys to land on the
 * exact frame), or a drag past either end for a time outside the project, which the ruler clamps.
 */
export async function seek(page: Page, seconds: number): Promise<void> {
  const ruler = page.getByRole("slider", { name: "Playhead" });
  const box = (await ruler.boundingBox())!;
  const { fps, duration } = await projectTiming(page);
  const y = box.y + box.height / 2;
  if (seconds <= 0 || seconds >= duration) {
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(seconds <= 0 ? box.x - 300 : box.x + box.width + 300, y, { steps: 4 });
    await page.mouse.up();
    return;
  }
  await page.mouse.click(box.x + (seconds / duration) * box.width, y);
  const want = Math.round(seconds * fps);
  const have = Math.round(Number(await ruler.getAttribute("aria-valuenow")) * fps);
  const key = want > have ? "ArrowRight" : "ArrowLeft";
  for (let i = 0; i < Math.abs(want - have); i++) await page.keyboard.press(key);
}
/**
 * Sets the project duration (seconds). The schema requires every layer to end at or
 * before the project end, so each layer is first moved to start at 0 and last for
 * the new duration; then the project duration is set.
 */
export async function setProjectDuration(page: Page, seconds: string): Promise<void> {
  const rows = layersPanel(page).getByRole("listitem");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).getByRole("button").first().click();
    await layerField(page, "Start (s)").fill("0");
    await layerField(page, "Duration (s)").fill(seconds);
  }
  await settingsPanel(page).getByLabel("Duration in seconds").fill(seconds);
}
/** Shrinks the canvas and sets the duration so an export finishes quickly. */
export async function shrinkProject(page: Page, duration: string): Promise<void> {
  const s = settingsPanel(page);
  await s.getByLabel("Width").fill("160");
  await s.getByLabel("Height").fill("90");
  await setProjectDuration(page, duration);
}
/** The role and accessible name of the selected layer's fields in the generated editor, by the field's former label. */
const LAYER_FIELDS: Readonly<Record<string, readonly [role: "textbox" | "combobox" | "spinbutton" | "radiogroup", name: string]>> = {
  Text: ["textbox", "Text"],
  Font: ["combobox", "Font"],
  Weight: ["combobox", "Weight"],
  Size: ["spinbutton", "Size in pixels"],
  Colour: ["textbox", "Text colour"],
  Align: ["radiogroup", "Align"],
  X: ["spinbutton", "Anchor X"],
  Y: ["spinbutton", "Anchor Y"],
  "Start (s)": ["spinbutton", "Start in seconds"],
  "Duration (s)": ["spinbutton", "Layer duration in seconds"],
};
/** A field of the selected layer, found by its role and accessible name in the inspector. */
export function layerField(page: Page, label: string): Locator {
  const field = LAYER_FIELDS[label];
  if (field === undefined) throw new Error(`unknown layer field: ${label}`);
  return inspectorPanel(page).getByRole(field[0], { name: field[1], exact: true });
}
/**
 * The control that adds an effect to the selected layer. It is a combobox named
 * "Add effect" while the preset picker is a select, and a button named "Add
 * effect" once the picker is the Effects Library dialog. The helpers below work
 * with either, so the specs that use them do not change when the picker is swapped.
 */
async function pickerKind(page: Page): Promise<"select" | "library"> {
  const combo = effectsPanel(page).getByRole("combobox", { name: "Add effect" });
  const button = effectsPanel(page).getByRole("button", { name: "Add effect" });
  await expect(combo.or(button)).toBeVisible();
  return (await combo.count()) > 0 ? "select" : "library";
}
/** Names of the presets the picker offers, in display order. */
export async function listPresetNames(page: Page): Promise<string[]> {
  if ((await pickerKind(page)) === "select") {
    const options = effectsPanel(page).getByRole("combobox", { name: "Add effect" }).getByRole("option");
    const names = await options.allInnerTexts();
    return names.map((n) => n.trim()).filter((n) => !n.endsWith("..."));
  }
  await effectsPanel(page).getByRole("button", { name: "Add effect" }).click();
  const dialog = page.getByRole("dialog", { name: "Effects library" });
  await expect(dialog).toBeVisible();
  const labels = await dialog.getByRole("listbox", { name: "Effects" }).getByRole("option").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  return labels.map((label) => label.split(",")[0].trim());
}
/** Adds the preset with this display name to the selected layer, with its defaults. */
export async function applyPreset(page: Page, displayName: string): Promise<void> {
  if ((await pickerKind(page)) === "select") {
    await effectsPanel(page).getByRole("combobox", { name: "Add effect" }).selectOption({ label: displayName });
    return;
  }
  await effectsPanel(page).getByRole("button", { name: "Add effect" }).click();
  const dialog = page.getByRole("dialog", { name: "Effects library" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("option", { name: new RegExp(`^${displayName},`) }).click();
  await dialog.getByRole("button", { name: "Apply to selected layer" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

/** The export formats of the generated Export Flow, by the start of the format card's accessible name. */
const EXPORT_FORMAT_CARDS = { mp4: /^MP4 video/, "png-sequence": /^PNG sequence/, gif: /^Animated GIF/, webp: /^Animated WebP/ } as const;
/** The format card (a radio) for an export format. */
export function exportFormat(page: Page, format: keyof typeof EXPORT_FORMAT_CARDS): Locator {
  return page.getByRole("dialog", { name: "Export" }).getByRole("radio", { name: EXPORT_FORMAT_CARDS[format] });
}
/** With the Export dialog open: picks a format, continues to the options, and starts the export. */
export async function exportAs(page: Page, format: keyof typeof EXPORT_FORMAT_CARDS, size?: RegExp): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Export" });
  await exportFormat(page, format).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  if (size !== undefined) {
    const sizes = dialog.getByRole("combobox", { name: "Size" });
    await sizes.selectOption({ label: (await sizes.getByRole("option").allInnerTexts()).map((t) => t.trim()).find((t) => size.test(t)) ?? "" });
  }
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
}
/** The export progress bar of the generated flow (a role=progressbar named "Rendering frames"). */
export function exportProgress(page: Page): Locator {
  return page.getByRole("dialog", { name: "Export" }).getByRole("progressbar", { name: "Rendering frames" });
}
/**
 * Installs (call before the export starts) an observer that records whether the export progress bar showed and the
 * values (aria-valuenow) it had, however briefly. Read it back with `progressSeen`.
 */
export async function watchExportProgress(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: { appeared: boolean; values: number[] } = { appeared: false, values: [] };
    (window as unknown as { __progressSeen: typeof seen }).__progressSeen = seen;
    const look = (): void => {
      const bar = document.querySelector('[role="progressbar"][aria-label="Rendering frames"]');
      if (bar) {
        seen.appeared = true;
        seen.values.push(Number(bar.getAttribute("aria-valuenow")));
      }
    };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}
export async function progressSeen(page: Page): Promise<{ appeared: boolean; values: number[] }> {
  return await page.evaluate(() => (window as unknown as { __progressSeen: { appeared: boolean; values: number[] } }).__progressSeen);
}
