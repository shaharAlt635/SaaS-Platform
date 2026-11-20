/**
 * HTTP-level tests: the real route handlers, use cases and Postgres, called with real Requests.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApiKey, revokeApiKey } from "@/application/use-cases/api-keys";
import { billingPeriod } from "@/domain/billing";
import { PLANS } from "@/domain/plans";
import { createOrg, createUser, container, db, describeDb, resetDatabase } from "./helpers";

const { POST: ingest } = await import("@/app/api/v1/events/route");
const { GET: health } = await import("@/app/api/health/route");
const { POST: stripeWebhook } = await import("@/app/api/webhooks/stripe/route");
const { GET: resetDemo } = await import("@/app/api/cron/reset-demo/route");

function post(body: unknown, token?: string) {
  return ingest(
    new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe.runIf(describeDb)("HTTP API", () => {
  let secret: string;
  let organizationId: string;

  beforeEach(async () => {
    await resetDatabase();
    const ctx = await createOrg(await createUser("Owner"), "acme");
    organizationId = ctx.organization.id;
    ({ secret } = await createApiKey(container, ctx, { name: "Test" }));
  });

  describe("POST /api/v1/events", () => {
    it("accepts a single event and a batch, scoped to the key's organization", async () => {
      expect((await post({ name: "signup", distinctId: "u1", properties: { plan: "pro" } }, secret)).status).toBe(202);
      const batch = await post({ events: [{ name: "a" }, { name: "b" }] }, secret);
      expect(batch.status).toBe(202);
      expect(await batch.json()).toEqual({ accepted: 2 });
      expect(await db.event.count({ where: { organizationId } })).toBe(3);
      expect(batch.headers.get("X-RateLimit-Remaining")).toMatch(/^\d+$/);
    });

    it("rejects missing, malformed and revoked keys with 401", async () => {
      expect((await post({ name: "x" })).status).toBe(401);
      expect((await post({ name: "x" }, "ak_definitely-not-valid")).status).toBe(401);
      expect((await post({ name: "x" }, "sk_live_wrong_prefix")).status).toBe(401);

      const key = await db.apiKey.findFirstOrThrow({ where: { organizationId } });
      const ctx = await createOrg(await createUser(), "other"); // unrelated org can't revoke it…
      await expect(revokeApiKey(container, ctx, { id: key.id })).rejects.toThrow();
      expect((await post({ name: "x" }, secret)).status).toBe(202); // …so it still works

      await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
      expect((await post({ name: "x" }, secret)).status).toBe(401);
    });

    it("returns 400 with a useful message for invalid payloads", async () => {
      const invalidJson = await post("{oops", secret);
      expect(invalidJson.status).toBe(400);
      expect((await invalidJson.json()).error.code).toBe("invalid_json");

      const badName = await post({ name: "<script>" }, secret);
      expect(badName.status).toBe(400);
      expect((await badName.json()).error.message).toMatch(/Event names may contain/);

      const tooMany = await post({ events: Array.from({ length: 101 }, () => ({ name: "x" })) }, secret);
      expect((await tooMany.json()).error.message).toMatch(/at most 100/);
      expect(await db.event.count()).toBe(0);
    });

    it("returns 429 once the plan's monthly quota is used up, without storing the batch", async () => {
      const limit = PLANS.FREE.limits.eventsPerMonth!;
      await db.usageCounter.create({ data: { organizationId, metric: "events", period: billingPeriod(new Date()), value: limit - 1 } });

      expect((await post({ name: "last_one" }, secret)).status).toBe(202);
      const over = await post({ events: [{ name: "a" }, { name: "b" }] }, secret);
      expect(over.status).toBe(429);
      expect((await over.json()).error.code).toBe("quota_exceeded");
      expect(await db.event.count()).toBe(1);
    });
  });

  it("GET /api/health reports database connectivity", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("POST /api/webhooks/stripe is disabled when billing isn't configured", async () => {
    const response = await stripeWebhook(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(response.status).toBe(404);
  });

  it("GET /api/cron/reset-demo is unavailable outside demo mode", async () => {
    const response = await resetDemo(new Request("http://localhost/api/cron/reset-demo", { headers: { Authorization: "Bearer anything" } }));
    expect(response.status).toBe(404);
  });
});
