import { test, expect } from "@playwright/test";
import { convertDc } from "../scripts/dc-convert-lib.mjs";
/**
 * Cascade layers in a real browser (Chromium). A converted inline-style class is UNLAYERED, so it beats
 * a helmet rule however specific that rule is, as the source's style attribute did; and `@layer screen`
 * beats `@layer ds` whatever the selector specificity.
 */
const doc = (body: string, css: string): string =>
  `<!DOCTYPE html>\n<html><head></head><body>\n<x-dc>\n<helmet><style>${css}</style></helmet>\n${body}\n</x-dc>\n</body></html>\n`;
test("an inline style beats a more specific helmet rule (.x:hover:not(:disabled))", async ({ page }) => {
  const r = convertDc(doc('<div><button class="x" style="color:blue">go</button></div>', ".x:hover:not(:disabled){color:red}"), { fileName: "T.dc.html" });
  const css = String(r.files.find((f) => f.path.endsWith(".css"))?.content ?? "");
  const tsx = String(r.files.find((f) => f.path.endsWith(".tsx"))?.content ?? "");
  const inlineClass = /"(dc-t-s[0-9a-f]{6})"/.exec(tsx)?.[1] ?? /(dc-t-s[0-9a-f]{6})/.exec(tsx)?.[1];
  expect(inlineClass, "the converted inline-style class").toBeTruthy();
  expect(css).toContain("@layer screen {");
  await page.setContent(`<style>${css}</style><div class="dc-t"><button class="x ${inlineClass}">go</button></div>`);
  const button = page.getByRole("button", { name: "go" });
  await button.hover();
  const colour = await button.evaluate((el) => getComputedStyle(el).color);
  expect(colour).toBe("rgb(0, 0, 255)");
});
test("the screen layer beats the ds layer whatever the specificity", async ({ page }) => {
  await page.setContent(`<style>@layer ds, screen; @layer ds { div.a.b.c { color: red } } @layer screen { .a { color: green } }</style><div class="a b c" id="t">x</div>`);
  expect(await page.locator("#t").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 128, 0)");
});
