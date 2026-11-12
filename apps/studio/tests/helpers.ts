import { expect, type Locator, type Page } from "@playwright/test";
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
/** The project settings panel. */
export function settingsPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Project settings" });
}
/** The layers panel. */
export function layersPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Layers" });
}
/** The effects panel. */
export function effectsPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Effects" });
}
/** Parses the transport readout ("frame N / M - T.TTs") into numbers. */
export async function readReadout(page: Page): Promise<{ frame: number; total: number; time: number }> {
  const text = (await page.getByLabel("Timecode").innerText()).trim();
  const m = /frame (\d+) \/ (\d+) - ([\d.]+)s/.exec(text);
  if (!m) throw new Error(`unexpected readout text: ${text}`);
  return { frame: Number(m[1]), total: Number(m[2]), time: Number(m[3]) };
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
  await settingsPanel(page).getByLabel("Duration (s)").fill(seconds);
}
/** Shrinks the canvas and sets the duration so an export finishes quickly. */
export async function shrinkProject(page: Page, duration: string): Promise<void> {
  const s = settingsPanel(page);
  await s.getByLabel("Width").fill("160");
  await s.getByLabel("Height").fill("90");
  await setProjectDuration(page, duration);
}
/**
 * A field of the selected layer, found by its label within the layers panel. A label
 * that wraps a select has the option texts in its text ("AlignLeftCenterRight"), so the
 * label is matched at its start, followed by end of text or a capital letter.
 */
export function layerField(page: Page, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return layersPanel(page).getByLabel(new RegExp(`^${escaped}(?![a-z])`));
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
