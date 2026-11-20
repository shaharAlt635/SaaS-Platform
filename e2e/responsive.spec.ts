import { expect, test } from "@playwright/test";
import { demoUsers, mainNav, signIn } from "./helpers";

test("the dashboard is fully usable on a phone", async ({ page }) => {
  await signIn(page, demoUsers.owner);
  await expect(mainNav(page)).toBeHidden(); // sidebar collapses into a drawer

  // Retry until hydrated: a tap before React attaches handlers is a no-op.
  const drawer = page.getByRole("dialog");
  await expect(async () => {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(drawer).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await drawer.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/o\/acme\/members/);
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
