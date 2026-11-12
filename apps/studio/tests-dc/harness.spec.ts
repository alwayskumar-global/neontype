import { test, expect, type Page } from "@playwright/test";

/**
 * dc-harness smoke tests (Requirement 17.10, 18.10), against the BUILT harness under the strict CSP.
 *  - index.html mounts the generated Studio Editor and imports no engine code: ZERO violations.
 *  - parity.html loads ds.css and exposes the export-parity probe: at most the one allowed Zod eval
 *    probe, and parity must be exactly 0 with ds.css present.
 */

declare global {
  interface Window {
    __csp?: { directive: string; blocked: string }[];
  }
}

async function watchCsp(page: Page): Promise<{ consoleCsp: string[] }> {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp?.push({ directive: e.effectiveDirective || e.violatedDirective, blocked: e.blockedURI });
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) consoleCsp.push(m.text());
  });
  return { consoleCsp };
}

test("the generated Studio Editor mounts under the strict CSP with zero violations", async ({ page }) => {
  const { consoleCsp } = await watchCsp(page);
  const failedRequests: string[] = [];
  page.on("requestfailed", (r) => failedRequests.push(r.url()));
  await page.goto("/index.html");

  // Landmarks from the generated markup.
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Width in pixels" })).toHaveValue("1280");
  // The design has a Play button in the top bar and another in the timeline; both come from sc-if paused=true.
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(2);
  await expect(page.getByRole("banner").getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0); // sc-if playing=false
  const logo = page.getByRole("img", { name: "NeonType" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((el) => (el as HTMLImageElement).naturalWidth), "logo loaded under img-src 'self'").toBeGreaterThan(0);

  // Dynamic styles reach the DOM through the CSSOM: a custom property is set on at least one element.
  const withVars = await page.evaluate(
    () => [...document.querySelectorAll<HTMLElement>("[class*='dc-studio-editor-s']")].filter((el) => el.style.getPropertyValue("--dc-0") !== "").length,
  );
  expect(withVars, "elements with --dc-0 set by setCssVars").toBeGreaterThan(0);

  // The scoped design-system tokens apply on the screen root.
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".ds-root.dc-studio-editor") as Element).backgroundColor);
  expect(bg).toMatch(/^rgb\(/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ds-root") as Element).getPropertyValue("--color-bg-app").trim())).not.toBe("");

  await page.waitForTimeout(300);
  const violations = await page.evaluate(() => window.__csp ?? []);
  expect(violations, `CSP violations: ${JSON.stringify(violations)}`).toEqual([]);
  expect(consoleCsp, consoleCsp.join("; ")).toEqual([]);
  expect(failedRequests, "no failed requests").toEqual([]);
});

test("the generated onClick calls the data function (handler wiring)", async ({ page }) => {
  await watchCsp(page);
  await page.goto("/index.html");
  const play = page.getByRole("banner").getByRole("button", { name: "Play", exact: true });
  await play.focus();
  await expect(play).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset["dcClicked"])).toBeUndefined();
  await play.click(); // asHandler(get(scope, "togglePlay")) -> the fixture function
  expect(await page.evaluate(() => document.documentElement.dataset["dcClicked"])).toBe("togglePlay");
  expect(await page.evaluate(() => window.__csp ?? [])).toEqual([]);
});

test("export parity is exactly 0 at t = 1, 3, 5.5 with ds.css loaded (one Zod eval probe tolerated)", async ({ page }) => {
  const { consoleCsp } = await watchCsp(page);
  await page.goto("/parity.html");
  await page.waitForFunction(() => typeof window.__studioExportParity === "function");

  // ds.css is really present in this build: its scoped token rule is in a loaded stylesheet.
  const hasDs = await page.evaluate(() =>
    [...document.styleSheets].some((s) => {
      // ds.css is wrapped in `@layer ds`, so the rule sits inside a CSSLayerBlockRule.
      const has = (rules: CSSRuleList): boolean =>
        [...rules].some((r) => (r instanceof CSSStyleRule && r.selectorText === ".ds-root") || (r instanceof CSSLayerBlockRule && has(r.cssRules)));
      try {
        return has(s.cssRules);
      } catch {
        return false;
      }
    }),
  );
  expect(hasDs, ".ds-root rule from ds.css is loaded").toBe(true);

  for (const t of [1, 3, 5.5]) {
    const ratio = await page.evaluate((tt) => window.__studioExportParity?.(tt), t);
    expect(ratio, `parity at t=${t}`).toBe(0);
  }

  const violations = await page.evaluate(() => window.__csp ?? []);
  const disallowed = violations.filter((v) => !(v.directive.startsWith("script-src") && v.blocked === "eval"));
  expect(disallowed, `unexpected CSP violations: ${JSON.stringify(disallowed)}`).toEqual([]);
  expect(violations.length).toBeLessThanOrEqual(1);
  expect(consoleCsp.filter((m) => !/eval/i.test(m)), "non-eval CSP console errors").toEqual([]);
});
