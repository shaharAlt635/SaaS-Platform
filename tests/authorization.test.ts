/**
 * Authorization is tested exhaustively: every protected use case is run as every role,
 * and the outcome must match the permission matrix in src/domain/rbac.ts exactly.
 * A new use case that forgets `authorize()` — or a matrix change — breaks this suite.
 */
import { describe, expect, it } from "vitest";
import { READ_ONLY_MESSAGE, resolveOrgContext, type OrgContext } from "@/application/context";
import { getAnalytics, listEvents } from "@/application/use-cases/analytics";
import { createApiKey, listApiKeys, revokeApiKey } from "@/application/use-cases/api-keys";
import { listAuditLog } from "@/application/use-cases/audit-log";
import { getBillingOverview, openBillingPortal, startCheckout } from "@/application/use-cases/billing";
import { inviteMember, listInvitations, revokeInvitation } from "@/application/use-cases/invitations";
import { changeMemberRole, listMembers, removeMember } from "@/application/use-cases/members";
import { deleteOrganization, updateOrganization } from "@/application/use-cases/organizations";
import { getOverview } from "@/application/use-cases/overview";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { hasPermission, type Permission, PERMISSIONS, ROLES, type Role } from "@/domain/rbac";
import { createFakeDeps } from "./fakes";

type Fixture = Awaited<ReturnType<typeof buildOrg>>;

/** An org on the Pro plan with one member of each role, a pending invite and an API key. */
async function buildOrg(slug = "acme") {
  const fake = createFakeDeps();
  const owner = fake.addUser("Owner");
  const org = await fake.addOrg(owner, slug);
  await fake.deps.organizations.update(org.id, { stripeCustomerId: "cus_acme" });
  await fake.deps.subscriptions.upsert(org.id, {
    plan: "PRO",
    status: "ACTIVE",
    interval: "MONTH",
    stripeSubscriptionId: "sub_acme",
    stripePriceId: "price_PRO_MONTH",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
  });
  const actors: Record<Role, ReturnType<typeof fake.addUser>> = {
    OWNER: owner,
    ADMIN: fake.addUser("Admin"),
    MEMBER: fake.addUser("Member"),
    VIEWER: fake.addUser("Viewer"),
  };
  for (const role of ["ADMIN", "MEMBER", "VIEWER"] as const) fake.join(org, actors[role], role);
  const target = fake.join(org, fake.addUser("Target"), "VIEWER");
  const { invitation } = await inviteMember(fake.deps, fake.ctxFor(org, owner), { email: "pending@example.com", role: "VIEWER" });
  const { apiKey } = await createApiKey(fake.deps, fake.ctxFor(org, owner), { name: "Existing key" });
  return { ...fake, org, actors, target, invitation, apiKey };
}

interface Case {
  name: string;
  permission: Permission;
  mutates: boolean;
  run: (fx: Fixture, ctx: OrgContext) => Promise<unknown>;
}

const CASES: Case[] = [
  { name: "view overview", permission: "organization:read", mutates: false, run: (fx, ctx) => getOverview(fx.deps, ctx) },
  {
    name: "update organization",
    permission: "organization:update",
    mutates: true,
    run: (fx, ctx) => updateOrganization(fx.deps, ctx, { name: "Renamed", slug: ctx.organization.slug }),
  },
  {
    name: "delete organization",
    permission: "organization:delete",
    mutates: true,
    run: (fx, ctx) => deleteOrganization(fx.deps, ctx, { confirmation: ctx.organization.slug }),
  },
  { name: "list members", permission: "members:read", mutates: false, run: (fx, ctx) => listMembers(fx.deps, ctx) },
  { name: "list invitations", permission: "members:read", mutates: false, run: (fx, ctx) => listInvitations(fx.deps, ctx) },
  {
    name: "invite member",
    permission: "members:invite",
    mutates: true,
    run: (fx, ctx) => inviteMember(fx.deps, ctx, { email: "new@example.com", role: "VIEWER" }),
  },
  { name: "revoke invitation", permission: "members:invite", mutates: true, run: (fx, ctx) => revokeInvitation(fx.deps, ctx, { id: fx.invitation.id }) },
  {
    name: "change member role",
    permission: "members:update",
    mutates: true,
    run: (fx, ctx) => changeMemberRole(fx.deps, ctx, { membershipId: fx.target.id, role: "MEMBER" }),
  },
  { name: "remove member", permission: "members:remove", mutates: true, run: (fx, ctx) => removeMember(fx.deps, ctx, { id: fx.target.id }) },
  { name: "list API keys", permission: "api_keys:read", mutates: false, run: (fx, ctx) => listApiKeys(fx.deps, ctx) },
  { name: "create API key", permission: "api_keys:manage", mutates: false, run: (fx, ctx) => createApiKey(fx.deps, ctx, { name: "New key" }) },
  { name: "revoke API key", permission: "api_keys:manage", mutates: false, run: (fx, ctx) => revokeApiKey(fx.deps, ctx, { id: fx.apiKey.id }) },
  { name: "view billing", permission: "billing:read", mutates: false, run: (fx, ctx) => getBillingOverview(fx.deps, ctx) },
  {
    name: "start checkout",
    permission: "billing:manage",
    mutates: true,
    // Expected to fail *after* authorization (already subscribed); only the auth outcome matters here.
    run: (fx, ctx) => startCheckout(fx.deps, ctx, { plan: "BUSINESS", interval: "YEAR" }).catch(ignoreUnlessForbidden),
  },
  { name: "open billing portal", permission: "billing:manage", mutates: true, run: (fx, ctx) => openBillingPortal(fx.deps, ctx) },
  { name: "view analytics", permission: "analytics:read", mutates: false, run: (fx, ctx) => getAnalytics(fx.deps, ctx, { range: "30d" }) },
  { name: "browse events", permission: "analytics:read", mutates: false, run: (fx, ctx) => listEvents(fx.deps, ctx) },
  { name: "view audit log", permission: "audit_log:read", mutates: false, run: (fx, ctx) => listAuditLog(fx.deps, ctx) },
];

function ignoreUnlessForbidden(error: unknown) {
  if (error instanceof ForbiddenError) throw error;
}

describe("authorization matrix", () => {
  describe.each(CASES)("$name requires $permission", ({ permission, run }) => {
    it.each(ROLES)("%s", async (role) => {
      const fx = await buildOrg();
      const outcome = run(fx, fx.ctxFor(fx.org, fx.actors[role]));
      if (hasPermission(role, permission)) {
        await expect(outcome).resolves.not.toThrow();
      } else {
        await expect(outcome).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });

  it("exercises every permission that exists", () => {
    expect(new Set(CASES.map((c) => c.permission))).toEqual(new Set(PERMISSIONS));
  });
});

/** Builds the fixture, then renames the org to the slug configured read-only in tests/fakes.ts. */
async function buildReadOnlyOrg() {
  const fx = await buildOrg();
  await fx.deps.organizations.update(fx.org.id, { slug: "demo-org" });
  return fx;
}

describe("read-only (public demo) organizations", () => {
  it.each(CASES.filter((c) => c.mutates))("blocks “$name” even for the owner", async ({ run }) => {
    const fx = await buildReadOnlyOrg();
    await expect(run(fx, fx.ctxFor(fx.org, fx.actors.OWNER))).rejects.toThrow(READ_ONLY_MESSAGE);
  });

  it("still allows reads", async () => {
    const fx = await buildReadOnlyOrg();
    const ctx = fx.ctxFor(fx.org, fx.actors.OWNER);
    await expect(getOverview(fx.deps, ctx)).resolves.toBeDefined();
    await expect(listMembers(fx.deps, ctx)).resolves.toHaveLength(5);
  });
});

describe("tenant isolation", () => {
  async function twoOrgs() {
    const fx = await buildOrg("alpha");
    const outsider = fx.addUser("Outsider");
    const beta = await fx.addOrg(outsider, "beta");
    const betaCtx = fx.ctxFor(beta, outsider);
    const betaMember = fx.join(beta, fx.addUser("Beta member"), "VIEWER");
    const { invitation } = await inviteMember(fx.deps, betaCtx, { email: "beta-invite@example.com", role: "VIEWER" });
    const { apiKey } = await createApiKey(fx.deps, betaCtx, { name: "Beta key" });
    // The attacker is the *owner* of alpha: maximum privilege, wrong tenant.
    return { fx, beta, attacker: fx.ctxFor(fx.org, fx.actors.OWNER), betaMember, invitation, apiKey };
  }

  it("hides other organizations entirely (404, not 403)", async () => {
    const { fx, beta } = await twoOrgs();
    await expect(resolveOrgContext(fx.deps, fx.actors.OWNER, beta.slug)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("can't touch another tenant's members, invitations or API keys by ID", async () => {
    const { fx, attacker, betaMember, invitation, apiKey } = await twoOrgs();
    await expect(changeMemberRole(fx.deps, attacker, { membershipId: betaMember.id, role: "ADMIN" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMember(fx.deps, attacker, { id: betaMember.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeInvitation(fx.deps, attacker, { id: invitation.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeApiKey(fx.deps, attacker, { id: apiKey.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(fx.state.apiKeys.find((key) => key.id === apiKey.id)?.revokedAt).toBeNull();
  });

  it("scopes ingested events to the API key's organization", async () => {
    const { fx, beta, apiKey } = await twoOrgs();
    const { ingestEvents } = await import("@/application/use-cases/analytics");
    await ingestEvents(fx.deps, apiKey, { name: "signup" });
    expect(fx.state.events.at(-1)?.organizationId).toBe(beta.id);
  });
});
