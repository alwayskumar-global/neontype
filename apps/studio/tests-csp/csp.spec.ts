import { test, expect } from "@playwright/test";
import { seek, settingsPanel } from "../tests/helpers.js";

/**
 * CSP conformance (Requirement 11.2, 11.3) against the PRODUCTION preview build
 * under the strict CSP. Exactly ONE caught feature probe is permitted — Zod's
 * `allowsEval` (`new Function("")`, guarded by jitless/Cloudflare checks and a
 * try/catch), which surfaces as a `script-src` / `eval` violation. Any other
 * violation, or a SECOND occurrence of anything, fails.
 */

declare global {
  interface Window {
    __csp?: { directive: string; blocked: string }[];
  }
}

const ALLOWED = { directive: "script-src", blocked: "eval" } as const;

test("production build emits only the one allowed Zod eval probe CSP violation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: e.blockedURI,
      });
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy/i.test(t) && !/eval/i.test(t)) consoleCsp.push(t);
  });

  await page.goto("/");
  // Representative session under the strict CSP: landing (with live previews),
  // then open the studio (loads the worker-backed export path indirectly).
  await expect(page.getByRole("heading", { name: "Animated titles, made in your browser." })).toBeVisible();
  await page.getByRole("button", { name: "Open the studio" }).first().click();
  await expect(page.locator("canvas.preview-canvas")).toBeVisible();
  await page.waitForTimeout(300);

  const violations = await page.evaluate(
    () => (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp,
  );

  // Allow exactly one, and only the named Zod probe.
  const disallowed = violations.filter(
    (v) => !(v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked),
  );
  expect(disallowed, `unexpected CSP violations: ${JSON.stringify(disallowed)}`).toEqual([]);
  const evalProbes = violations.filter(
    (v) => v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked,
  );
  expect(evalProbes.length, "exactly one caught Zod eval probe").toBeLessThanOrEqual(1);
  expect(consoleCsp, `non-eval CSP console errors: ${consoleCsp.join("; ")}`).toEqual([]);
});

test("a worker-path export with bundled fonts completes under the strict CSP", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: e.blockedURI,
      });
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy/i.test(t) && !/eval/i.test(t)) consoleCsp.push(t);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open the studio" }).first().click();
  await expect(page.locator("canvas.preview-canvas")).toBeVisible();
  // Keep the export small: 160x90, 0.5 s.
  const settings = settingsPanel(page);
  await settings.getByLabel("Width").fill("160");
  await settings.getByLabel("Height").fill("90");
  await settings.getByLabel("Duration in seconds").fill("0.5");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("radio", { name: /^PNG sequence/ }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog.getByText("frames.zip")).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("frames.zip");

  const violations = await page.evaluate(
    () => (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp,
  );
  const disallowed = violations.filter(
    (v) => !(v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked),
  );
  expect(disallowed, `unexpected CSP violations: ${JSON.stringify(disallowed)}`).toEqual([]);
  expect(consoleCsp, `non-eval CSP console errors: ${consoleCsp.join("; ")}`).toEqual([]);
});

test("canvas drag, nudge, timeline drag and undo add no CSP violations", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: e.blockedURI,
      });
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy/i.test(t) && !/eval/i.test(t)) consoleCsp.push(t);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open the studio" }).first().click();
  await expect(page.locator("canvas.preview-canvas")).toBeVisible();
  await seek(page, 3);
  await page.waitForTimeout(100);

  const rect = (await page.locator("canvas.preview-canvas").boundingBox())!;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + (rect.height * 270) / 720; // inside the demo title

  // Canvas drag + nudge + undo (positions the selection outline through CSS variables).
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".selection-outline")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");

  // Timeline: the handle and bar positions are CSS custom properties too.
  const handle = page.getByRole("slider", { name: "Motion Text, end", exact: true });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 80, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const violations = await page.evaluate(
    () => (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp,
  );
  const disallowed = violations.filter(
    (v) => !(v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked),
  );
  expect(disallowed, `unexpected CSP violations: ${JSON.stringify(disallowed)}`).toEqual([]);
  expect(
    violations.filter((v) => v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked).length,
    "at most the one Zod eval probe",
  ).toBeLessThanOrEqual(1);
  expect(consoleCsp, `non-eval CSP console errors: ${consoleCsp.join("; ")}`).toEqual([]);
});
