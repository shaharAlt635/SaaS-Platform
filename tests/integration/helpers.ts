import type { Actor, OrgContext } from "@/application/context";
import { resolveOrgContext } from "@/application/context";
import { container } from "@/infrastructure/container";
import { db } from "@/infrastructure/db";

export const describeDb = Boolean(process.env.TEST_DATABASE_URL);

const TABLES = [
  "audit_logs", "usage_counters", "events", "api_keys", "billing_events", "subscriptions",
  "invitations", "memberships", "organizations", "verifications", "accounts", "sessions", "users",
];

export async function resetDatabase() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function createUser(name = "User", email?: string): Promise<Actor> {
  counter += 1;
  const user = await db.user.create({ data: { name, email: email ?? `user${counter}-${Date.now()}@example.com` } });
  return { userId: user.id, email: user.email, name: user.name };
}

export async function createOrg(owner: Actor, slug: string): Promise<OrgContext> {
  await container.organizations.createWithOwner({ name: `Org ${slug}`, slug }, owner.userId);
  return resolveOrgContext(container, owner, slug);
}

export { container, db };
