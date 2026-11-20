import { type DailyPoint, fillDailySeries, percentChange, rangeWindows } from "@/domain/analytics";
import { billingPeriod } from "@/domain/billing";
import type { AuditLogEntry } from "@/domain/entities";
import { type Plan, PLANS } from "@/domain/plans";
import { authorize, can, type OrgContext } from "../context";
import type { Dependencies } from "../ports";
import { getOrganizationPlan } from "./billing";

export interface Overview {
  plan: Plan;
  members: number;
  activeApiKeys: number;
  eventsThisMonth: number;
  last30: { events: number; users: number; eventsChange: number | null; usersChange: number | null };
  series: DailyPoint[];
  recentActivity: AuditLogEntry[] | null;
}

export async function getOverview(
  deps: Pick<Dependencies, "analytics" | "subscriptions" | "memberships" | "apiKeys" | "auditLogs" | "clock">,
  ctx: OrgContext,
): Promise<Overview> {
  authorize(ctx, "organization:read");
  const id = ctx.organization.id;
  const now = deps.clock();
  const { current, previous } = rangeWindows(30, now);

  const planId = await getOrganizationPlan(deps, id);
  const plan = PLANS[planId];
  const showActivity = plan.auditLog && can(ctx, "audit_log:read");

  const [members, activeApiKeys, eventsThisMonth, totals, previousTotals, daily, activity] = await Promise.all([
    deps.memberships.count(id),
    deps.apiKeys.countActive(id),
    deps.analytics.usage(id, billingPeriod(now)),
    deps.analytics.totals(id, current),
    deps.analytics.totals(id, previous),
    deps.analytics.daily(id, current),
    showActivity ? deps.auditLogs.list(id, { limit: 6 }) : Promise.resolve(null),
  ]);

  return {
    plan,
    members,
    activeApiKeys,
    eventsThisMonth,
    last30: {
      ...totals,
      eventsChange: percentChange(totals.events, previousTotals.events),
      usersChange: percentChange(totals.users, previousTotals.users),
    },
    series: fillDailySeries(current, daily),
    recentActivity: activity?.items ?? null,
  };
}
