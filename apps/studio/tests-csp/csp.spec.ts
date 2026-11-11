import { test, expect } from "@playwright/test";

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
  const nums = page.locator(".app-left .panel input[type='number']");
  await nums.nth(0).fill("160");
  await nums.nth(1).fill("90");
  await nums.nth(3).fill("0.5");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Export png-sequence/ }).click();
  await expect(page.getByText(/^Done: frames\.zip/)).toBeVisible({ timeout: 30_000 });

  const violations = await page.evaluate(
    () => (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp,
  );
  const disallowed = violations.filter(
    (v) => !(v.directive.startsWith(ALLOWED.directive) && v.blocked === ALLOWED.blocked),
  );
  expect(disallowed, `unexpected CSP violations: ${JSON.stringify(disallowed)}`).toEqual([]);
  expect(consoleCsp, `non-eval CSP console errors: ${consoleCsp.join("; ")}`).toEqual([]);
});
