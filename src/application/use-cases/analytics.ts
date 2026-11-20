import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  type DailyPoint,
  fillDailySeries,
  percentChange,
  RANGE_DAYS,
  rangeWindows,
} from "@/domain/analytics";
import { billingPeriod } from "@/domain/billing";
import type { ApiKey, StoredEvent, TrackedEvent } from "@/domain/entities";
import { assertWithinLimit, HISTORY_DAYS, PLANS } from "@/domain/plans";
import { analyticsRangeSchema, eventsQuerySchema, ingestPayloadSchema, parseInput } from "@/domain/validation";
import { authorize, type OrgContext } from "../context";
import type { Dependencies } from "../ports";
import { getOrganizationPlan } from "./billing";

const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export interface AnalyticsReport {
  range: AnalyticsRange;
  availableRanges: AnalyticsRange[];
  totals: { events: number; users: number; eventsPerUser: number };
  change: { events: number | null; users: number | null; eventsPerUser: number | null };
  series: DailyPoint[];
  topEvents: Array<{ name: string; count: number; share: number }>;
}

export async function getAnalytics(
  deps: Pick<Dependencies, "analytics" | "subscriptions" | "clock">,
  ctx: OrgContext,
  input: { range?: unknown },
): Promise<AnalyticsReport> {
  authorize(ctx, "analytics:read");
  const plan = await getOrganizationPlan(deps, ctx.organization.id);
  const availableRanges = ANALYTICS_RANGES.filter((range) => RANGE_DAYS[range] <= HISTORY_DAYS[plan]);
  const requested = analyticsRangeSchema.parse(input.range);
  const range = availableRanges.includes(requested) ? requested : (availableRanges.at(-1) ?? "7d");

  const { current, previous } = rangeWindows(RANGE_DAYS[range], deps.clock());
  const id = ctx.organization.id;
  const [totals, previousTotals, daily, top] = await Promise.all([
    deps.analytics.totals(id, current),
    deps.analytics.totals(id, previous),
    deps.analytics.daily(id, current),
    deps.analytics.topEvents(id, current, 8),
  ]);

  const perUser = (t: { events: number; users: number }) => (t.users === 0 ? 0 : t.events / t.users);
  return {
    range,
    availableRanges,
    totals: { ...totals, eventsPerUser: perUser(totals) },
    change: {
      events: percentChange(totals.events, previousTotals.events),
      users: percentChange(totals.users, previousTotals.users),
      eventsPerUser: percentChange(perUser(totals), perUser(previousTotals)),
    },
    series: fillDailySeries(current, daily),
    topEvents: top.map((row) => ({ ...row, share: totals.events === 0 ? 0 : row.count / totals.events })),
  };
}

export async function ingestEvents(
  deps: Pick<Dependencies, "analytics" | "subscriptions" | "clock">,
  apiKey: ApiKey,
  payload: unknown,
): Promise<{ accepted: number }> {
  const { events } = parseInput(ingestPayloadSchema, payload);
  const now = deps.clock();
  const period = billingPeriod(now);
  const organizationId = apiKey.organizationId;

  const [plan, used] = await Promise.all([getOrganizationPlan(deps, organizationId), deps.analytics.usage(organizationId, period)]);
  assertWithinLimit(PLANS[plan].limits.eventsPerMonth, used, events.length, "events per month");

  const tracked: TrackedEvent[] = events.map((event) => ({
    name: event.name,
    distinctId: event.distinctId ?? null,
    properties: event.properties ?? null,
    // Never trust client clocks that claim to be in the future.
    occurredAt: event.timestamp && event.timestamp.getTime() <= now.getTime() + MAX_CLOCK_SKEW_MS ? event.timestamp : now,
  }));
  await deps.analytics.ingest(organizationId, tracked, period);
  return { accepted: tracked.length };
}

const EVENTS_PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

export interface EventsPage {
  items: StoredEvent[];
  nextCursor: string | null;
  names: string[];
  name: string | null;
  historyDays: number;
}

/** Event explorer: raw events, newest first, within the plan's history window. */
export async function listEvents(
  deps: Pick<Dependencies, "analytics" | "subscriptions" | "clock">,
  ctx: OrgContext,
  input: { name?: unknown; cursor?: unknown } = {},
): Promise<EventsPage> {
  authorize(ctx, "analytics:read");
  const { name, cursor } = eventsQuerySchema.parse(input);
  const plan = await getOrganizationPlan(deps, ctx.organization.id);
  const historyDays = HISTORY_DAYS[plan];
  const since = new Date(deps.clock().getTime() - historyDays * DAY_MS);

  const [page, names] = await Promise.all([
    deps.analytics.recent(ctx.organization.id, { since, limit: EVENTS_PAGE_SIZE, cursor, name }),
    deps.analytics.eventNames(ctx.organization.id, since),
  ]);
  return { ...page, names, name: name ?? null, historyDays };
}
