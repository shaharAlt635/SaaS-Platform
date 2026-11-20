import { expect, type Page, test } from "@playwright/test";
import { demoUsers, signIn } from "./helpers";

/**
 * Regenerates the README screenshots in docs/screenshots. Not part of the regular suite:
 *   npm run build && npx next start -p 3200
 *   CAPTURE_SCREENSHOTS=1 E2E_BASE_URL=http://localhost:3200 npx playwright test screenshots --project=desktop
 */
test.skip(!process.env.CAPTURE_SCREENSHOTS, "set CAPTURE_SCREENSHOTS=1 to regenerate docs/screenshots");
test.use({ viewport: { width: 1440, height: 900 } });

const OUT = "docs/screenshots";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.locator(".recharts-surface").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function shoot(page: Page, path: string, name: string, options: { height?: number } = {}) {
  // A taller viewport (not fullPage) keeps the sticky sidebar spanning the whole image.
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1440, height: options.height ?? 900 });
  await page.goto(path);
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const scheme of ["light", "dark"] as const) {
  test(`capture ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const suffix = scheme === "dark" ? "-dark" : "";

    await shoot(page, "/", `landing${suffix}`);
    await signIn(page, demoUsers.owner);
    await shoot(page, "/o/acme", `overview${suffix}`);
    await shoot(page, "/o/acme/analytics?range=90d", `analytics${suffix}`);
    if (scheme === "dark") return;

    await shoot(page, "/o/acme/events", "events");
    await shoot(page, "/o/acme/members", "members");
    await shoot(page, "/o/acme/billing", "billing", { height: 1080 });
    await shoot(page, "/o/acme/api-keys", "api-keys");
    await shoot(page, "/o/acme/activity", "audit-log");

    // Authorization, as seen by a Viewer.
    await page.context().clearCookies();
    await signIn(page, demoUsers.viewer);
    await shoot(page, "/o/acme/billing", "viewer-access-denied");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
}

test("capture mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signIn(page, demoUsers.owner);
  await page.goto("/o/acme");
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile-overview.png` });
  await expect(async () => {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mobile-navigation.png` });
  await context.close();
});
