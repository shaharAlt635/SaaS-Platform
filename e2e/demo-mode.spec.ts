import { expect, test } from "@playwright/test";

/**
 * Public-demo protections. Runs only against a server started with DEMO_MODE=true:
 *   E2E_DEMO_MODE=1 npx playwright test demo-mode
 * Also works as a smoke test for the live deployment (set E2E_BASE_URL).
 */
test.skip(!process.env.E2E_DEMO_MODE, "requires a server running with DEMO_MODE=true");

test("one click opens the shared demo workspace, which is read-only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the live demo" }).click();
  await expect(page).toHaveURL(/\/o\/acme$/);
  await expect(page.getByText("Shared demo workspace")).toBeVisible();

  // Mutations are rejected by the server even for the owner, and nothing changes.
  await page.goto("/o/acme/settings");
  await page.locator("#name").fill("Hijacked Inc");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/shared demo workspace, so changes are disabled/)).toBeVisible();
  await page.reload();
  await expect(page.locator("#name")).toHaveValue("Acme Inc");

  // Demo accounts can't be modified or locked out.
  await page.goto("/account");
  await page.locator("#name").fill("Someone Else");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Demo accounts can't be changed")).toBeVisible();
});

test("nobody can register or reset passwords on demo addresses, or trigger the reset job", async ({ request }) => {
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { name: "Impostor", email: "taylor@acme.test", password: "impostor-password" },
  });
  expect(signUp.status()).toBe(403);

  const reset = await request.post("/api/auth/request-password-reset", { data: { email: "demo@acme.test", redirectTo: "/reset-password" } });
  expect(reset.status()).toBe(403);

  const cron = await request.get("/api/cron/reset-demo", { headers: { Authorization: "Bearer guess" } });
  expect([401, 404]).toContain(cron.status());
});
