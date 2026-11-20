/**
 * Repository tests against real Postgres: constraints, transactions, cascades and the
 * hand-written analytics SQL can only be trusted when they run on the real engine.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { inviteMember } from "@/application/use-cases/invitations";
import { createUser, createOrg, container, db, describeDb, resetDatabase } from "./helpers";

const DAY = 86_400_000;

describe.runIf(describeDb)("Postgres repositories", () => {
  beforeEach(resetDatabase);

  describe("organizations & memberships", () => {
    it("creates the organization and its owner membership together", async () => {
      const owner = await createUser("Owner");
      const ctx = await createOrg(owner, "acme");
      expect(ctx.membership.role).toBe("OWNER");
      expect(await container.organizations.listForUser(owner.userId)).toEqual([expect.objectContaining({ slug: "acme", role: "OWNER" })]);
    });

    it("enforces globally unique slugs", async () => {
      const owner = await createUser();
      await createOrg(owner, "taken");
      await expect(container.organizations.createWithOwner({ name: "Dup", slug: "taken" }, owner.userId)).rejects.toThrow();
    });

    it("matches members by email case-insensitively and lists owners first", async () => {
      const owner = await createUser("Owner");
      const ctx = await createOrg(owner, "acme");
      const viewer = await createUser("Viewer", "Mixed.Case@Example.com");
      await db.membership.create({ data: { organizationId: ctx.organization.id, userId: viewer.userId, role: "VIEWER" } });

      expect(await container.memberships.isMemberByEmail(ctx.organization.id, "mixed.case@example.com")).toBe(true);
      expect((await container.memberships.list(ctx.organization.id)).map((m) => m.role)).toEqual(["OWNER", "VIEWER"]);
    });

    it("cascades organization deletion to all tenant data", async () => {
      const owner = await createUser();
      const ctx = await createOrg(owner, "acme");
      const id = ctx.organization.id;
      await container.analytics.ingest(id, [{ name: "signup", distinctId: "u1", properties: null, occurredAt: new Date() }], "2026-11");
      await container.apiKeys.create({ organizationId: id, name: "k", prefix: "ak_1", keyHash: "hash-1", createdById: owner.userId });

      await container.organizations.delete(id);

      const counts = await Promise.all([
        db.membership.count({ where: { organizationId: id } }),
        db.event.count({ where: { organizationId: id } }),
        db.apiKey.count({ where: { organizationId: id } }),
        db.usageCounter.count({ where: { organizationId: id } }),
      ]);
      expect(counts).toEqual([0, 0, 0, 0]);
      expect(await db.user.count({ where: { id: owner.userId } })).toBe(1); // users outlive organizations
    });
  });

  describe("invitations", () => {
    it("re-inviting the same email refreshes the invitation instead of duplicating it", async () => {
      const owner = await createUser("Owner");
      const ctx = await createOrg(owner, "acme");
      await inviteMember(container, ctx, { email: "bob@example.com", role: "VIEWER" });
      await inviteMember(container, ctx, { email: "bob@example.com", role: "ADMIN" });
      const invitations = await db.invitation.findMany({ where: { organizationId: ctx.organization.id } });
      expect(invitations).toHaveLength(1);
      expect(invitations[0]?.role).toBe("ADMIN");
    });

    it("accepts atomically: membership and invitation change together or not at all", async () => {
      const owner = await createUser("Owner");
      const ctx = await createOrg(owner, "acme");
      const invitation = await container.invitations.upsert({
        organizationId: ctx.organization.id,
        email: "owner-again@example.com",
        role: "VIEWER",
        tokenHash: "token-hash",
        invitedById: owner.userId,
        expiresAt: new Date(Date.now() + DAY),
      });

      // The owner is already a member, so creating the membership violates a unique constraint…
      await expect(container.invitations.accept(invitation.id, owner.userId)).rejects.toThrow();
      // …and the transaction rolls back: the invitation must still exist.
      expect(await container.invitations.findById(invitation.id)).not.toBeNull();

      const bob = await createUser("Bob");
      const membership = await container.invitations.accept(invitation.id, bob.userId);
      expect(membership.role).toBe("VIEWER");
      expect(await container.invitations.findById(invitation.id)).toBeNull();
    });

    it("excludes expired invitations from pending counts", async () => {
      const owner = await createUser();
      const ctx = await createOrg(owner, "acme");
      const now = new Date();
      for (const [email, offset] of [["live@example.com", DAY], ["expired@example.com", -DAY]] as const) {
        await container.invitations.upsert({
          organizationId: ctx.organization.id,
          email,
          role: "VIEWER",
          tokenHash: email,
          invitedById: owner.userId,
          expiresAt: new Date(now.getTime() + offset),
        });
      }
      expect(await container.invitations.countPending(ctx.organization.id, now)).toBe(1);
    });
  });

  describe("analytics SQL", () => {
    it("buckets by UTC day, counts distinct users and respects [from, to) windows", async () => {
      const owner = await createUser();
      const { organization } = await createOrg(owner, "acme");
      const at = (iso: string, name = "page_view", distinctId: string | null = "u1") => ({ name, distinctId, properties: null, occurredAt: new Date(iso) });

      await container.analytics.ingest(
        organization.id,
        [
          at("2026-11-18T23:59:59Z"),
          at("2026-11-19T00:00:00Z", "signup", "u2"),
          at("2026-11-19T12:00:00Z", "signup", "u2"),
          at("2026-11-19T13:00:00Z", "signup", null), // anonymous: counted as an event, not a user
          at("2026-11-20T00:00:00Z"), // exactly at `to`: excluded
        ],
        "2026-11",
      );

      const window = { from: new Date("2026-11-18T00:00:00Z"), to: new Date("2026-11-20T00:00:00Z") };
      expect(await container.analytics.daily(organization.id, window)).toEqual([
        { date: "2026-11-18", events: 1, users: 1 },
        { date: "2026-11-19", events: 3, users: 1 },
      ]);
      expect(await container.analytics.totals(organization.id, window)).toEqual({ events: 4, users: 2 });
      expect(await container.analytics.topEvents(organization.id, window, 5)).toEqual([
        { name: "signup", count: 3 },
        { name: "page_view", count: 1 },
      ]);
    });

    it("increments the monthly usage counter in the same transaction as the insert", async () => {
      const owner = await createUser();
      const { organization } = await createOrg(owner, "acme");
      const event = { name: "x", distinctId: null, properties: { plan: "pro" }, occurredAt: new Date() };
      await container.analytics.ingest(organization.id, [event, event], "2026-11");
      await container.analytics.ingest(organization.id, [event], "2026-11");
      expect(await container.analytics.usage(organization.id, "2026-11")).toBe(3);
      expect(await container.analytics.usage(organization.id, "2026-12")).toBe(0);
    });

    it("never leaks another tenant's events into a report", async () => {
      const a = await createOrg(await createUser(), "alpha");
      const b = await createOrg(await createUser(), "beta");
      const now = new Date();
      await container.analytics.ingest(b.organization.id, [{ name: "secret", distinctId: "x", properties: null, occurredAt: now }], "2026-11");
      const window = { from: new Date(now.getTime() - DAY), to: new Date(now.getTime() + DAY) };
      expect(await container.analytics.totals(a.organization.id, window)).toEqual({ events: 0, users: 0 });
      expect(await container.analytics.topEvents(a.organization.id, window, 5)).toEqual([]);
    });
  });

  describe("audit log pagination", () => {
    it("walks every entry exactly once, newest first", async () => {
      const owner = await createUser();
      const { organization } = await createOrg(owner, "acme");
      await db.auditLog.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({
          organizationId: organization.id,
          actorId: owner.userId,
          action: `action.${i}`,
          createdAt: new Date(Date.UTC(2026, 10, 1 + i)),
        })),
      });

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await container.auditLogs.list(organization.id, { limit: 3, cursor });
        seen.push(...page.items.map((item) => item.action));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toEqual(["action.6", "action.5", "action.4", "action.3", "action.2", "action.1", "action.0"]);
    });
  });

  describe("billing & API keys", () => {
    it("records webhook events idempotently", async () => {
      await container.billingEvents.markProcessed("evt_1", "customer.subscription.updated");
      await container.billingEvents.markProcessed("evt_1", "customer.subscription.updated");
      expect(await container.billingEvents.wasProcessed("evt_1")).toBe(true);
      expect(await db.billingEvent.count()).toBe(1);
    });

    it("upserts one subscription per organization", async () => {
      const { organization } = await createOrg(await createUser(), "acme");
      const snapshot = {
        plan: "PRO" as const,
        status: "TRIALING" as const,
        interval: "MONTH" as const,
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_1",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
      };
      await container.subscriptions.upsert(organization.id, snapshot);
      await container.subscriptions.upsert(organization.id, { ...snapshot, status: "ACTIVE" });
      expect(await db.subscription.count()).toBe(1);
      expect((await container.subscriptions.findByOrganization(organization.id))?.status).toBe("ACTIVE");
    });

    it("never authenticates a revoked key", async () => {
      const owner = await createUser();
      const { organization } = await createOrg(owner, "acme");
      const key = await container.apiKeys.create({ organizationId: organization.id, name: "k", prefix: "ak_1", keyHash: "h1", createdById: owner.userId });
      expect(await container.apiKeys.findActiveByHash("h1")).not.toBeNull();
      await container.apiKeys.revoke(key.id, new Date());
      expect(await container.apiKeys.findActiveByHash("h1")).toBeNull();
    });
  });
});
