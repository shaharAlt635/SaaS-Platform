/**
 * The shared demo workspace. Its credentials are public on purpose (README, "Try the demo" button);
 * with DEMO_MODE=true the workspace and its accounts are read-only so visitors can't break it.
 */
export const DEMO = {
  emailDomain: "acme.test",
  ownerEmail: "demo@acme.test",
  password: "demo-password-123",
  organizationSlugs: ["acme", "side-project"],
  homeSlug: "acme",
} as const;

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO.emailDomain}`);
}
