import { expect, type Page } from "@playwright/test";
import { DEMO } from "../src/config/demo";

export const demoUsers = {
  owner: DEMO.ownerEmail,
  admin: `jordan@${DEMO.emailDomain}`,
  member: `sam@${DEMO.emailDomain}`,
  viewer: `riley@${DEMO.emailDomain}`,
} as const;

export async function signIn(page: Page, email: string, password: string = DEMO.password) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/o\//);
}

export function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" });
}
