import { test, expect } from "@playwright/test";
import { gotoStudio } from "./helpers.js";
/** The page base: no default body margin, no white page, and the editor fits the viewport without a scrollbar. */
for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`the editor has no page border or scrollbar at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoStudio(page, true);
    const base = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const root = document.documentElement;
      return {
        margin: cs.margin,
        background: cs.backgroundColor,
        htmlBackground: getComputedStyle(root).backgroundColor,
        scrollHeight: root.scrollHeight,
        scrollWidth: root.scrollWidth,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
      };
    });
    expect(base.margin).toBe("0px");
    expect(base.background).not.toBe("rgb(255, 255, 255)");
    expect(base.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(base.htmlBackground).not.toBe("rgb(255, 255, 255)");
    expect(base.scrollHeight).toBeLessThanOrEqual(base.innerHeight);
    expect(base.scrollWidth).toBeLessThanOrEqual(base.innerWidth);
  });
}
test("index.html has the product title and a description", async ({ request }) => {
  // The landing page sets a longer title once it mounts; the document itself is titled NeonType.
  const html = await (await request.get("http://localhost:5273/")).text();
  expect(html).toContain("<title>NeonType</title>");
  expect(html).toMatch(/<meta name="description" content="[^"]*animated text titles/);
});
