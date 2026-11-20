export const ANALYTICS_RANGES = ["7d", "30d", "90d", "365d"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const RANGE_DAYS: Readonly<Record<AnalyticsRange, number>> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

export const RANGE_LABELS: Readonly<Record<AnalyticsRange, string>> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
};

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  events: number;
  users: number;
}

export interface Window {
  from: Date;
  to: Date;
}

const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Current window covers the last `days` days including today; previous window is the same length right before it. */
export function rangeWindows(days: number, now: Date): { current: Window; previous: Window } {
  const to = new Date(startOfUtcDay(now).getTime() + DAY_MS);
  const from = new Date(to.getTime() - days * DAY_MS);
  return {
    current: { from, to },
    previous: { from: new Date(from.getTime() - days * DAY_MS), to: from },
  };
}

/** Ensures one point per day so charts don't silently skip days without activity. */
export function fillDailySeries(window: Window, rows: readonly DailyPoint[]): DailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const points: DailyPoint[] = [];
  for (let t = window.from.getTime(); t < window.to.getTime(); t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    points.push(byDate.get(date) ?? { date, events: 0, users: 0 });
  }
  return points;
}

/** Relative change in percent, or null when there's no baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
