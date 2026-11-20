import { Activity, ChartColumn, Lock, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getAnalytics } from "@/application/use-cases/analytics";
import { EmptyState, PageHeader, StatCard } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ANALYTICS_RANGES, type AnalyticsRange, RANGE_DAYS, RANGE_LABELS } from "@/domain/analytics";
import { MetricChartCard } from "@/features/analytics/components/metric-chart-card";
import { container } from "@/infrastructure/container";
import { cn, formatNumber } from "@/lib/utils";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Analytics" };

const SHORT_LABELS: Record<AnalyticsRange, string> = { "7d": "7D", "30d": "30D", "90d": "90D", "365d": "12M" };

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await getOrgContext((await params).slug);
  const report = await getAnalytics(container, ctx, { range: (await searchParams).range });
  const days = RANGE_DAYS[report.range];
  const base = `/o/${ctx.organization.slug}`;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Event volume and audience across your product."
        actions={
          <nav aria-label="Date range" className="inline-flex rounded-lg border bg-card p-0.5 text-sm shadow-xs">
            {ANALYTICS_RANGES.map((range) => {
              const available = report.availableRanges.includes(range);
              const active = range === report.range;
              return available ? (
                <Link
                  key={range}
                  href={`?range=${range}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={RANGE_LABELS[range]}
                  title={RANGE_LABELS[range]}
                  className={cn("rounded-md px-3 py-1 font-medium tabular-nums transition", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {SHORT_LABELS[range]}
                </Link>
              ) : (
                <Link
                  key={range}
                  href={`${base}/billing`}
                  title={`${RANGE_LABELS[range]} — upgrade for longer history`}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1 tabular-nums text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <Lock className="size-3" aria-hidden /> {SHORT_LABELS[range]}
                  <span className="sr-only">{RANGE_LABELS[range]} (requires upgrade)</span>
                </Link>
              );
            })}
          </nav>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Events" value={formatNumber(report.totals.events)} delta={report.change.events} hint={`vs previous ${days === 365 ? "12 months" : `${days} days`}`} icon={Activity} />
        <StatCard label="Unique users" value={formatNumber(report.totals.users)} delta={report.change.users} hint={`vs previous ${days === 365 ? "12 months" : `${days} days`}`} icon={Users} />
        <StatCard
          label="Events per user"
          value={report.totals.eventsPerUser.toFixed(1)}
          delta={report.change.eventsPerUser}
          hint="engagement"
          icon={Zap}
        />
      </div>

      {report.totals.events === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={ChartColumn} title="No events in this period" description="Send events with an API key to see them here." />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <MetricChartCard series={report.series} description={`${RANGE_LABELS[report.range]}, UTC`} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Top events</CardTitle>
              <CardDescription>Share of all events in the period</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3.5">
                {report.topEvents.map((event) => (
                  <li key={event.name} className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-mono text-xs">{event.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatNumber(event.count)} <span className="text-xs text-muted-foreground">({(event.share * 100).toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(event.share * 100, 1)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
