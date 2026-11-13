import { test, expect } from "@playwright/test";
import { gotoStudio, layersPanel } from "./helpers.js";
/** The inspector's empty state is hidden while a layer is selected and shown when none is. */
test("the empty inspector is hidden while a layer is selected and visible when none is", async ({ page }) => {
  await gotoStudio(page, true);
  const empty = page.getByText("No layer selected");
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toBeVisible();
  await expect(empty).toBeHidden();
  const rows = layersPanel(page).getByRole("listitem");
  while ((await rows.count()) > 0) await rows.first().getByRole("button", { name: /^Delete / }).click();
  await expect(empty).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toHaveCount(0);
});
test("selecting a layer again hides the empty state", async ({ page }) => {
  await gotoStudio(page, true);
  const rows = layersPanel(page).getByRole("listitem");
  await layersPanel(page).getByRole("button", { name: "Add layer" }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByText("No layer selected")).toBeHidden();
});
