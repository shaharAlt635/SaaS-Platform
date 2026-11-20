import { describe, expect, it } from "vitest";
import { fillDailySeries, percentChange, rangeWindows } from "@/domain/analytics";
import { billingPeriod, effectivePlan } from "@/domain/billing";
import { PlanLimitError } from "@/domain/errors";
import { assertWithinLimit, remaining } from "@/domain/plans";
import { assignableRoles, canAssignRole, canManageMember, hasPermission } from "@/domain/rbac";
import { slugify } from "@/domain/slug";
import { ingestPayloadSchema, parseInput, slugSchema } from "@/domain/validation";

describe("rbac", () => {
  it("grants billing management to owners only", () => {
    expect(hasPermission("OWNER", "billing:manage")).toBe(true);
    expect(hasPermission("ADMIN", "billing:manage")).toBe(false);
    expect(hasPermission("ADMIN", "billing:read")).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(hasPermission("VIEWER", "analytics:read")).toBe(true);
    expect(hasPermission("VIEWER", "api_keys:read")).toBe(false);
    expect(hasPermission("VIEWER", "members:invite")).toBe(false);
  });

  it("prevents privilege escalation", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(true);
    expect(assignableRoles("MEMBER")).toEqual(["MEMBER", "VIEWER"]);
  });

  it("only lets actors manage members ranked below them, except owners", () => {
    expect(canManageMember("ADMIN", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("OWNER", "OWNER")).toBe(true);
  });
});

describe("plans & billing", () => {
  it("falls back to FREE unless the subscription is entitled", () => {
    expect(effectivePlan(null)).toBe("FREE");
    expect(effectivePlan({ plan: "PRO", status: "ACTIVE" })).toBe("PRO");
    expect(effectivePlan({ plan: "PRO", status: "PAST_DUE" })).toBe("PRO");
    expect(effectivePlan({ plan: "PRO", status: "CANCELED" })).toBe("FREE");
    expect(effectivePlan({ plan: "BUSINESS", status: "UNPAID" })).toBe("FREE");
  });

  it("enforces limits and treats null as unlimited", () => {
    expect(() => assertWithinLimit(3, 3, 1, "members")).toThrow(PlanLimitError);
    expect(() => assertWithinLimit(3, 2, 1, "members")).not.toThrow();
    expect(() => assertWithinLimit(null, 1e9, 1, "members")).not.toThrow();
    expect(remaining(null, 5)).toBeNull();
    expect(remaining(3, 5)).toBe(0);
  });

  it("formats billing periods in UTC", () => {
    expect(billingPeriod(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(billingPeriod(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
});

describe("analytics helpers", () => {
  it("builds back-to-back windows that include today", () => {
    const { current, previous } = rangeWindows(7, new Date("2026-11-20T15:00:00Z"));
    expect(current.to.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(current.from.toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(previous.to).toEqual(current.from);
    expect(previous.from.toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });

  it("fills missing days with zeros", () => {
    const { current } = rangeWindows(3, new Date("2026-11-20T10:00:00Z"));
    const series = fillDailySeries(current, [{ date: "2026-11-19", events: 5, users: 2 }]);
    expect(series).toEqual([
      { date: "2026-11-18", events: 0, users: 0 },
      { date: "2026-11-19", events: 5, users: 2 },
      { date: "2026-11-20", events: 0, users: 0 },
    ]);
  });

  it("computes percent change without dividing by zero", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe("validation", () => {
  it("slugifies names and rejects reserved slugs", () => {
    expect(slugify("  Ácme, Inc!  ")).toBe("acme-inc");
    expect(slugSchema.safeParse("dashboard").success).toBe(false);
    expect(slugSchema.safeParse("acme-inc").success).toBe(true);
  });

  it("accepts a single event or a batch", () => {
    expect(parseInput(ingestPayloadSchema, { name: "signup" }).events).toHaveLength(1);
    expect(parseInput(ingestPayloadSchema, { events: [{ name: "a" }, { name: "b" }] }).events).toHaveLength(2);
    expect(() => parseInput(ingestPayloadSchema, { events: [] })).toThrow();
    expect(() => parseInput(ingestPayloadSchema, { name: "<script>" })).toThrow();
  });
});
