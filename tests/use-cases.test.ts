import { describe, expect, it } from "vitest";
import { ingestEvents } from "@/application/use-cases/analytics";
import { authenticateApiKey, createApiKey, revokeApiKey } from "@/application/use-cases/api-keys";
import { handleBillingWebhook, startCheckout } from "@/application/use-cases/billing";
import { acceptInvitation, inviteMember } from "@/application/use-cases/invitations";
import { changeMemberRole, removeMember } from "@/application/use-cases/members";
import { createOrganization, updateOrganization } from "@/application/use-cases/organizations";
import type { ProviderSubscription } from "@/application/ports";
import { ConflictError, ForbiddenError, PlanLimitError, ValidationError } from "@/domain/errors";
import { createFakeDeps } from "./fakes";

function setup() {
  const fake = createFakeDeps();
  const owner = fake.addUser("Olivia");
  return { ...fake, owner };
}

describe("organizations", () => {
  it("creates an organization with the creator as owner and a unique slug", async () => {
    const { deps, owner, state } = setup();
    const first = await createOrganization(deps, owner, { name: "Acme Inc" });
    const second = await createOrganization(deps, owner, { name: "Acme Inc" });
    expect(first.slug).toBe("acme-inc");
    expect(second.slug).toMatch(/^acme-inc-[a-z0-9]+$/);
    expect(state.memberships.find((m) => m.organizationId === first.id)?.role).toBe("OWNER");
    expect(state.auditLogs.some((log) => log.action === "organization.created")).toBe(true);
  });

  it("rejects a taken slug on update and forbids members from editing", async () => {
    const { deps, owner, addOrg, join, ctxFor, addUser } = setup();
    await addOrg(owner, "taken");
    const org = await addOrg(owner, "mine");
    await expect(updateOrganization(deps, ctxFor(org, owner), { name: "Mine", slug: "taken" })).rejects.toBeInstanceOf(ValidationError);

    const member = addUser("Mike");
    join(org, member, "MEMBER");
    await expect(updateOrganization(deps, ctxFor(org, member), { name: "Hacked", slug: "mine" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("members", () => {
  it("lets an admin demote a member but not touch another admin", async () => {
    const { deps, owner, addOrg, addUser, join, ctxFor, state } = setup();
    const org = await addOrg(owner);
    const admin = addUser("Ada");
    const otherAdmin = addUser("Alan");
    const member = addUser("Mia");
    join(org, admin, "ADMIN");
    const otherAdminMembership = join(org, otherAdmin, "ADMIN");
    const memberMembership = join(org, member, "MEMBER");

    await changeMemberRole(deps, ctxFor(org, admin), { membershipId: memberMembership.id, role: "VIEWER" });
    expect(state.memberships.find((m) => m.id === memberMembership.id)?.role).toBe("VIEWER");

    await expect(changeMemberRole(deps, ctxFor(org, admin), { membershipId: otherAdminMembership.id, role: "MEMBER" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeMemberRole(deps, ctxFor(org, admin), { membershipId: memberMembership.id, role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("never leaves an organization without an owner", async () => {
    const { deps, owner, addOrg, addUser, join, ctxFor } = setup();
    const org = await addOrg(owner);
    const coOwner = addUser("Cora");
    const coOwnerMembership = join(org, coOwner, "OWNER");

    // With two owners, one can demote the other…
    await changeMemberRole(deps, ctxFor(org, owner), { membershipId: coOwnerMembership.id, role: "ADMIN" });
    // …but the last owner can't leave.
    await expect(removeMember(deps, ctxFor(org, owner), { id: ctxFor(org, owner).membership.id })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows anyone to leave, even without members:remove", async () => {
    const { deps, owner, addOrg, addUser, join, ctxFor, state } = setup();
    const org = await addOrg(owner);
    const viewer = addUser("Vic");
    const membership = join(org, viewer, "VIEWER");
    await expect(removeMember(deps, ctxFor(org, viewer), { id: membership.id })).resolves.toEqual({ self: true });
    expect(state.memberships.some((m) => m.id === membership.id)).toBe(false);
  });
});

describe("invitations", () => {
  it("counts pending invitations against the seat limit", async () => {
    const { deps, owner, addOrg, ctxFor } = setup();
    const org = await addOrg(owner); // Free plan: 3 seats, owner uses 1
    const ctx = ctxFor(org, owner);
    await inviteMember(deps, ctx, { email: "a@example.com", role: "MEMBER" });
    await inviteMember(deps, ctx, { email: "b@example.com", role: "MEMBER" });
    // Re-sending an existing invite doesn't take another seat.
    await inviteMember(deps, ctx, { email: "a@example.com", role: "ADMIN" });
    await expect(inviteMember(deps, ctx, { email: "c@example.com", role: "MEMBER" })).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("emails a link and only accepts it for the invited address", async () => {
    const { deps, owner, addOrg, addUser, ctxFor, state } = setup();
    const org = await addOrg(owner);
    const { inviteUrl } = await inviteMember(deps, ctxFor(org, owner), { email: "Bob@Example.com", role: "ADMIN" });
    const token = inviteUrl.split("/").at(-1)!;
    expect(state.sentEmails[0]?.to).toBe("bob@example.com");

    const mallory = addUser("Mallory", "mallory@example.com");
    await expect(acceptInvitation(deps, mallory, token)).rejects.toBeInstanceOf(ForbiddenError);

    const bob = addUser("Bob", "bob@example.com");
    await acceptInvitation(deps, bob, token);
    expect(state.memberships.find((m) => m.userId === bob.userId)?.role).toBe("ADMIN");
    expect(state.invitations).toHaveLength(0);
  });

  it("stops members from inviting above their own role", async () => {
    const { deps, owner, addOrg, addUser, join, ctxFor } = setup();
    const org = await addOrg(owner);
    const admin = addUser("Ada");
    join(org, admin, "ADMIN");
    await expect(inviteMember(deps, ctxFor(org, admin), { email: "x@example.com", role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("api keys & ingestion", () => {
  it("stores only a hash, authenticates the secret, and rejects revoked keys", async () => {
    const { deps, owner, addOrg, ctxFor, state } = setup();
    const org = await addOrg(owner);
    const ctx = ctxFor(org, owner);
    const { secret, apiKey } = await createApiKey(deps, ctx, { name: "Backend" });

    expect(secret.startsWith("ak_")).toBe(true);
    expect(JSON.stringify(state.apiKeys)).not.toContain(secret);
    expect((await authenticateApiKey(deps, secret))?.id).toBe(apiKey.id);
    expect(await authenticateApiKey(deps, "ak_wrong")).toBeNull();

    await revokeApiKey(deps, ctx, { id: apiKey.id });
    expect(await authenticateApiKey(deps, secret)).toBeNull();
  });

  it("enforces the monthly event quota and clamps future timestamps", async () => {
    const { deps, owner, addOrg, ctxFor, now, state } = setup();
    const org = await addOrg(owner);
    const { apiKey } = await createApiKey(deps, ctxFor(org, owner), { name: "Backend" });

    await ingestEvents(deps, apiKey, { name: "signup", timestamp: new Date(now.getTime() + 86_400_000).toISOString() });
    expect(state.events[0]?.occurredAt).toEqual(now);

    await deps.analytics.ingest(org.id, Array.from({ length: 9_999 }, () => ({ name: "x", distinctId: null, properties: null, occurredAt: now })), "2026-11");
    await expect(ingestEvents(deps, apiKey, { name: "one_too_many" })).rejects.toBeInstanceOf(PlanLimitError);
  });
});

describe("billing", () => {
  const providerSub = (overrides: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
    id: "sub_1",
    customerId: "cus_1",
    organizationId: null,
    priceId: "price_PRO_MONTH",
    status: "ACTIVE",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEnd: null,
    ...overrides,
  });

  it("offers a trial on first checkout and requires the owner", async () => {
    const { deps, owner, addOrg, addUser, join, ctxFor } = setup();
    const org = await addOrg(owner);
    const url = await startCheckout(deps, ctxFor(org, owner), { plan: "PRO", interval: "MONTH" });
    expect(url).toContain("trial=14");

    const admin = addUser("Ada");
    join(org, admin, "ADMIN");
    await expect(startCheckout(deps, ctxFor(org, admin), { plan: "PRO", interval: "MONTH" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("syncs subscriptions idempotently", async () => {
    const { deps, owner, addOrg, state } = setup();
    const org = await addOrg(owner);
    const event = { id: "evt_1", type: "customer.subscription.updated", subscription: providerSub({ organizationId: org.id }) };
    state.webhookQueue.push(event, event);

    expect(await handleBillingWebhook(deps, "{}", "sig")).toBe("processed");
    expect(await handleBillingWebhook(deps, "{}", "sig")).toBe("duplicate");
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]?.plan).toBe("PRO");
    expect(state.organizations.find((o) => o.id === org.id)?.stripeCustomerId).toBe("cus_1");
  });

  it("ignores a stale canceled subscription that would overwrite an active one", async () => {
    const { deps, owner, addOrg, state } = setup();
    const org = await addOrg(owner);
    state.webhookQueue.push(
      { id: "evt_new", type: "customer.subscription.created", subscription: providerSub({ id: "sub_new", organizationId: org.id, priceId: "price_BUSINESS_YEAR" }) },
      { id: "evt_old", type: "customer.subscription.deleted", subscription: providerSub({ id: "sub_old", organizationId: org.id, status: "CANCELED" }) },
    );
    await handleBillingWebhook(deps, "{}", "sig");
    expect(await handleBillingWebhook(deps, "{}", "sig")).toBe("ignored");
    expect(state.subscriptions[0]).toMatchObject({ stripeSubscriptionId: "sub_new", plan: "BUSINESS", interval: "YEAR", status: "ACTIVE" });
  });

  it("fails loudly on unknown prices so the provider retries", async () => {
    const { deps, owner, addOrg, state } = setup();
    const org = await addOrg(owner);
    state.webhookQueue.push({ id: "evt_x", type: "customer.subscription.updated", subscription: providerSub({ organizationId: org.id, priceId: "price_unknown" }) });
    await expect(handleBillingWebhook(deps, "{}", "sig")).rejects.toThrow(/unknown price/);
    expect(state.processedEvents.has("evt_x")).toBe(false);
  });
});
