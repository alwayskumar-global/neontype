import { test, expect, type Page } from "@playwright/test";
import { canvasHash, gotoStudio, layersPanel, readReadout } from "./helpers.js";
/**
 * Accessibility basics (Requirement 12). Checks use roles, labels, and Playwright's
 * ARIA snapshot (no axe-core: its MPL-2.0 licence is outside the approved set).
 * The structural checks hold for any UI that exposes named controls, so they do not
 * depend on how the studio's panels are built. The ARIA snapshot covers the landing
 * page, which stays hand-written.
 */
const CONTROL_ROLES = ["button", "textbox", "spinbutton", "combobox", "checkbox", "slider", "link"] as const;
test("every control in the studio has an accessible name", async ({ page }) => {
  await gotoStudio(page, true);
  for (const role of CONTROL_ROLES) {
    const controls = await page.getByRole(role).all();
    for (const [i, control] of controls.entries()) {
      await expect(control, `${role} #${i}`).toHaveAccessibleName(/\S/);
    }
  }
});
test("the landing page navigation matches its ARIA snapshot", async ({ page }) => {
  await page.goto("http://localhost:5273/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toMatchAriaSnapshot(`
    - navigation "Primary":
      - link "How it works"
      - link "Exports"
      - link "Examples"
      - link "Privacy"
      - button "Open the studio"
  `);
});
/** The accessible label or text of the focused element, and whether it is the body. */
async function focused(page: Page): Promise<{ name: string; isBody: boolean; outline: string }> {
  return await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { name: "", isBody: true, outline: "" };
    const cs = getComputedStyle(el);
    const name = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40);
    return { name, isBody: false, outline: `${cs.outlineStyle}|${cs.boxShadow}` };
  });
}
test("keyboard focus moves through the top bar in order, never to the page body, and is visible", async ({ page }) => {
  await gotoStudio(page, true);
  await page.getByRole("button", { name: /^Back to .* home$/ }).focus();
  const seen: string[] = [];
  for (let i = 1; i <= 30; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    expect(f.isBody, `focus is on an element after ${i} Tabs`).toBe(false);
    expect(f.outline, `focus ring on "${f.name}"`).not.toBe("none|none");
    seen.push(f.name);
  }
  const order = ["New", "Load demo", "Save", "Open"].map((n) => seen.indexOf(n));
  expect(order.every((i) => i >= 0), `top bar buttons present: ${seen.slice(0, 8).join(", ")}`).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(seen.indexOf("Export")).toBeGreaterThan(order[3]);
  // The panels and the transport are reachable by Tab too.
  expect(seen.some((n) => n === "Add layer")).toBe(true);
});
test("Enter and Space operate buttons from the keyboard", async ({ page }) => {
  await gotoStudio(page, false);
  const rows = layersPanel(page).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await layersPanel(page).getByRole("button", { name: "Add layer" }).focus();
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(2);
  await page.keyboard.press("Space");
  await expect(rows).toHaveCount(3);
});
test("the export dialog closes on Escape and returns focus to the control that opened it", async ({ page }) => {
  await gotoStudio(page, true);
  const opener = page.getByRole("button", { name: "Export", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
test("reduced motion leaves the preview animating and the chrome without transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoStudio(page, false);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  // The preview animation is not reduced: playing advances the readout and changes pixels.
  const hash0 = await canvasHash(page);
  await page.getByRole("button", { name: "Play" }).first().click();
  await expect.poll(async () => (await readReadout(page)).time, { timeout: 4000 }).toBeGreaterThan(0.3);
  expect((await canvasHash(page)) === hash0).toBe(false);
  await page.getByRole("button", { name: "Pause" }).first().click();
  // Chrome controls have no transition under reduced motion.
  const durations = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).map((b) => getComputedStyle(b).transitionDuration),
  );
  expect(durations.length).toBeGreaterThan(5);
  for (const d of durations) expect(d.split(",").every((x) => parseFloat(x) === 0), `transition-duration ${d}`).toBe(true);
});
