import { expect, test } from "@playwright/test";
import { demoUsers, mainNav, signIn } from "./helpers";

test.describe("role-based access in the UI", () => {
  test("viewers get read-only analytics and no admin surfaces", async ({ page }) => {
    await signIn(page, demoUsers.viewer);
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Analytics" })).toBeVisible();
    for (const name of ["API keys", "Billing", "Audit log"]) {
      await expect(nav.getByRole("link", { name })).toHaveCount(0);
    }

    // Typing the URL directly doesn't help: the server checks permissions too.
    for (const path of ["billing", "api-keys", "activity"]) {
      await page.goto(`/o/acme/${path}`);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
    }

    await page.goto("/o/acme/members");
    await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);

    await page.goto("/o/acme/settings");
    await expect(page.getByText("Only admins can change settings.")).toBeVisible();
    await expect(page.locator("#name")).toBeDisabled();
  });

  test("admins manage members below them but can't touch owners or billing", async ({ page }) => {
    await signIn(page, demoUsers.admin);
    await page.goto("/o/acme/members");
    await expect(page.getByRole("button", { name: "Invite member" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role for Sam Rivera" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role for Riley Chen" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role for Alex Morgan" })).toHaveCount(0);

    // Admins can only grant roles up to their own.
    const options = page.getByRole("combobox", { name: "Role for Sam Rivera" }).locator("option");
    await expect(options).toHaveText(["Admin", "Member", "Viewer"]);

    await page.goto("/o/acme/billing");
    await expect(page.getByText("Only owners can change the plan.")).toBeVisible();
  });

  test("owners see every section", async ({ page }) => {
    await signIn(page, demoUsers.owner);
    const nav = mainNav(page);
    for (const name of ["Overview", "Analytics", "Members", "API keys", "Billing", "Audit log", "Settings"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    await page.goto("/o/acme/activity");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("invited taylor@acme.test")).toBeVisible();
  });
});
