/**
 * In-memory implementations of every port, so use cases can be tested without a database.
 */
import type { Actor, OrgContext } from "@/application/context";
import type { BillingWebhookEvent, Dependencies, SubscriptionSnapshot } from "@/application/ports";
import type { Subscription } from "@/domain/billing";
import type { ApiKey, AuditLogEntry, Invitation, Membership, Organization, TrackedEvent, UserSummary } from "@/domain/entities";
import type { Role } from "@/domain/rbac";

let sequence = 0;
const id = (prefix: string) => `${prefix}_${++sequence}`;

export function createFakeDeps(now = new Date("2026-11-20T12:00:00Z")) {
  const users = new Map<string, UserSummary>();
  const organizations: Organization[] = [];
  const memberships: Membership[] = [];
  const invitations: Array<Invitation & { tokenHash: string }> = [];
  const subscriptions: Subscription[] = [];
  const processedEvents = new Set<string>();
  const apiKeys: Array<ApiKey & { keyHash: string }> = [];
  const events: Array<TrackedEvent & { organizationId: string }> = [];
  const usage = new Map<string, number>();
  const auditLogs: Array<{ organizationId: string; action: string; actorId: string | null; metadata?: Record<string, unknown> }> = [];
  const sentEmails: Array<{ to: string; subject: string }> = [];
  const webhookQueue: Array<BillingWebhookEvent | null> = [];

  const deps: Dependencies = {
    organizations: {
      findById: async (orgId) => organizations.find((o) => o.id === orgId) ?? null,
      findBySlug: async (slug) => organizations.find((o) => o.slug === slug) ?? null,
      findByStripeCustomerId: async (customerId) => organizations.find((o) => o.stripeCustomerId === customerId) ?? null,
      slugExists: async (slug) => organizations.some((o) => o.slug === slug),
      createWithOwner: async (data, ownerUserId) => {
        const org: Organization = { id: id("org"), stripeCustomerId: null, createdAt: now, ...data };
        organizations.push(org);
        memberships.push({ id: id("mem"), organizationId: org.id, userId: ownerUserId, role: "OWNER" });
        return org;
      },
      update: async (orgId, data) => {
        const org = organizations.find((o) => o.id === orgId)!;
        Object.assign(org, data);
        return { ...org };
      },
      delete: async (orgId) => void organizations.splice(organizations.findIndex((o) => o.id === orgId), 1),
      listForUser: async (userId) =>
        memberships
          .filter((m) => m.userId === userId)
          .map((m) => ({ ...organizations.find((o) => o.id === m.organizationId)!, role: m.role })),
    },
    memberships: {
      find: async (organizationId, userId) => memberships.find((m) => m.organizationId === organizationId && m.userId === userId) ?? null,
      findById: async (membershipId) => memberships.find((m) => m.id === membershipId) ?? null,
      list: async (organizationId) =>
        memberships
          .filter((m) => m.organizationId === organizationId)
          .map((m) => ({ ...m, user: users.get(m.userId)!, joinedAt: now })),
      count: async (organizationId) => memberships.filter((m) => m.organizationId === organizationId).length,
      countByRole: async (organizationId, role) => memberships.filter((m) => m.organizationId === organizationId && m.role === role).length,
      isMemberByEmail: async (organizationId, email) =>
        memberships.some((m) => m.organizationId === organizationId && users.get(m.userId)?.email.toLowerCase() === email.toLowerCase()),
      updateRole: async (membershipId, role) => void (memberships.find((m) => m.id === membershipId)!.role = role),
      delete: async (membershipId) => void memberships.splice(memberships.findIndex((m) => m.id === membershipId), 1),
    },
    invitations: {
      upsert: async (data) => {
        const existing = invitations.find((i) => i.organizationId === data.organizationId && i.email === data.email);
        if (existing) {
          Object.assign(existing, data);
          return existing;
        }
        const invitation = { id: id("inv"), createdAt: now, invitedBy: null, ...data };
        invitations.push(invitation);
        return invitation;
      },
      findById: async (invitationId) => invitations.find((i) => i.id === invitationId) ?? null,
      findByTokenHash: async (tokenHash) => {
        const invitation = invitations.find((i) => i.tokenHash === tokenHash);
        return invitation ? { ...invitation, organization: organizations.find((o) => o.id === invitation.organizationId)! } : null;
      },
      listPending: async (organizationId, at) => invitations.filter((i) => i.organizationId === organizationId && i.expiresAt > at),
      countPending: async (organizationId, at) => invitations.filter((i) => i.organizationId === organizationId && i.expiresAt > at).length,
      delete: async (invitationId) => {
        const index = invitations.findIndex((i) => i.id === invitationId);
        if (index >= 0) invitations.splice(index, 1);
      },
      accept: async (invitationId, userId) => {
        const invitation = invitations.splice(invitations.findIndex((i) => i.id === invitationId), 1)[0]!;
        const membership = { id: id("mem"), organizationId: invitation.organizationId, userId, role: invitation.role };
        memberships.push(membership);
        return membership;
      },
    },
    subscriptions: {
      findByOrganization: async (organizationId) => subscriptions.find((s) => s.organizationId === organizationId) ?? null,
      upsert: async (organizationId, snapshot: SubscriptionSnapshot) => {
        const existing = subscriptions.find((s) => s.organizationId === organizationId);
        if (existing) return Object.assign(existing, snapshot);
        const subscription = { id: id("sub"), organizationId, ...snapshot };
        subscriptions.push(subscription);
        return subscription;
      },
    },
    billingEvents: {
      wasProcessed: async (eventId) => processedEvents.has(eventId),
      markProcessed: async (eventId) => void processedEvents.add(eventId),
    },
    apiKeys: {
      list: async (organizationId) => apiKeys.filter((k) => k.organizationId === organizationId),
      countActive: async (organizationId) => apiKeys.filter((k) => k.organizationId === organizationId && !k.revokedAt).length,
      findById: async (keyId) => apiKeys.find((k) => k.id === keyId) ?? null,
      findActiveByHash: async (keyHash) => apiKeys.find((k) => k.keyHash === keyHash && !k.revokedAt) ?? null,
      create: async (data) => {
        const key = { id: id("key"), createdAt: now, lastUsedAt: null, revokedAt: null, createdBy: null, ...data };
        apiKeys.push(key);
        return key;
      },
      revoke: async (keyId, at) => void (apiKeys.find((k) => k.id === keyId)!.revokedAt = at),
      touch: async (keyId, at) => void (apiKeys.find((k) => k.id === keyId)!.lastUsedAt = at),
    },
    analytics: {
      ingest: async (organizationId, batch, period) => {
        events.push(...batch.map((event) => ({ ...event, organizationId })));
        usage.set(`${organizationId}:${period}`, (usage.get(`${organizationId}:${period}`) ?? 0) + batch.length);
      },
      usage: async (organizationId, period) => usage.get(`${organizationId}:${period}`) ?? 0,
      totals: async (organizationId, window) => {
        const inWindow = events.filter((e) => e.organizationId === organizationId && e.occurredAt >= window.from && e.occurredAt < window.to);
        return { events: inWindow.length, users: new Set(inWindow.map((e) => e.distinctId)).size };
      },
      daily: async () => [],
      topEvents: async () => [],
    },
    auditLogs: {
      record: async (entry) => void auditLogs.push(entry),
      list: async () => ({ items: [] as AuditLogEntry[], nextCursor: null }),
    },
    billing: {
      enabled: true,
      priceFor: (plan, interval) => `price_${plan}_${interval}`,
      resolvePrice: (priceId) => {
        const match = /^price_(PRO|BUSINESS)_(MONTH|YEAR)$/.exec(priceId);
        return match ? { plan: match[1] as "PRO" | "BUSINESS", interval: match[2] as "MONTH" | "YEAR" } : null;
      },
      createCustomer: async ({ organizationId }) => `cus_${organizationId}`,
      createCheckoutSession: async ({ priceId, trialDays }) => `https://checkout.test/${priceId}?trial=${trialDays}`,
      createPortalSession: async ({ customerId }) => `https://portal.test/${customerId}`,
      cancelSubscription: async () => {},
      parseWebhook: async () => webhookQueue.shift() ?? null,
    },
    mailer: { send: async (message) => void sentEmails.push(message) },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    config: { appName: "Test", appUrl: "https://app.test", readOnlyOrganizationSlugs: ["demo-org"] },
    clock: () => now,
  };

  function addUser(name: string, email = `${name.toLowerCase()}@example.com`): Actor {
    const userId = id("user");
    users.set(userId, { id: userId, name, email, image: null });
    return { userId, name, email };
  }

  async function addOrg(owner: Actor, slug = `org-${sequence + 1}`) {
    return deps.organizations.createWithOwner({ name: `Org ${slug}`, slug }, owner.userId);
  }

  function join(org: Organization, actor: Actor, role: Role): Membership {
    const membership = { id: id("mem"), organizationId: org.id, userId: actor.userId, role };
    memberships.push(membership);
    return membership;
  }

  function ctxFor(org: Organization, actor: Actor): OrgContext {
    const membership = memberships.find((m) => m.organizationId === org.id && m.userId === actor.userId)!;
    return { actor, organization: { ...organizations.find((o) => o.id === org.id)! }, membership: { id: membership.id, role: membership.role } };
  }

  return {
    deps,
    now,
    state: { organizations, memberships, invitations, subscriptions, apiKeys, events, auditLogs, sentEmails, webhookQueue, processedEvents },
    addUser,
    addOrg,
    join,
    ctxFor,
  };
}
