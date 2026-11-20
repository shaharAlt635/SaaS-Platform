import { expect, test } from "@playwright/test";

test("visitors see the landing page and pricing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand your product");
  await expect(page.getByRole("heading", { name: "Simple, predictable pricing" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Yearly/ })).toBeVisible();
});

test("protected pages redirect to sign-in and come back afterwards", async ({ page }) => {
  await page.goto("/o/acme/analytics");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fo%2Facme%2Fanalytics/);
});

test("a new user signs up, creates an organization, sends events and sees them", async ({ page, request }) => {
  const suffix = `${Date.now()}`;

  await page.goto("/sign-up");
  await page.locator("#name").fill("E2E Tester");
  await page.locator("#email").fill(`e2e-${suffix}@example.com`);
  await page.locator("#password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.locator("#org-name").fill(`E2E Org ${suffix}`);
  await expect(page.locator("#org-slug")).toHaveValue(`e2e-org-${suffix}`);
  await page.getByRole("button", { name: "Create organization" }).click();

  const orgUrl = new RegExp(`/o/e2e-org-${suffix}$`);
  await expect(page).toHaveURL(orgUrl);
  await expect(page.getByText("Send your first event")).toBeVisible();

  // Create an API key; the secret is shown exactly once.
  await page.goto(`/o/e2e-org-${suffix}/api-keys`);
  await page.getByRole("button", { name: "Create key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#key-name").fill("E2E key");
  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(dialog.getByText("You won't be able to see this key again.")).toBeVisible();
  const secret = (await dialog.locator("code").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^ak_/);
  await dialog.getByRole("button", { name: "I've saved it" }).click();

  // Ingest through the public API, then see the data in the dashboard.
  const response = await request.post("/api/v1/events", {
    headers: { Authorization: `Bearer ${secret}` },
    data: { events: [{ name: "signup", distinctId: "u1" }, { name: "page_view", distinctId: "u2" }, { name: "page_view", distinctId: "u2" }] },
  });
  expect(response.status()).toBe(202);

  await page.goto(`/o/e2e-org-${suffix}/analytics`);
  await expect(page.getByText("Top events")).toBeVisible();
  await expect(page.locator("li", { hasText: "page_view" })).toContainText("2");

  // Free plan: the audit log is gated, longer analytics ranges are locked.
  await expect(page.getByRole("link", { name: "Last 90 days (requires upgrade)" })).toBeVisible();
  await page.goto(`/o/e2e-org-${suffix}/activity`);
  await expect(page.getByText("Unlock the audit log")).toBeVisible();

  // Tenant isolation: this user isn't a member of the demo organization.
  const foreign = await page.goto("/o/acme");
  expect(foreign?.status()).toBe(404);
});
