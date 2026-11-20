const RESERVED = new Set([
  "admin", "api", "app", "auth", "billing", "dashboard", "help", "invite", "new", "o",
  "onboarding", "settings", "sign-in", "sign-up", "static", "support", "www",
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}
