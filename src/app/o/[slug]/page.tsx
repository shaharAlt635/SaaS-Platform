import { Activity, ArrowRight, Gauge, KeyRound, Terminal, Users } from "lucide-react";
import Link from "next/link";
import { can } from "@/application/context";
import { getOverview } from "@/application/use-cases/overview";
import { TrendChart } from "@/components/charts/trend-chart";
import { EmptyState, PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/misc";
import { env } from "@/config/env";
import { ActivityFeed } from "@/features/audit/components/activity-feed";
import { container } from "@/infrastructure/container";
import { formatNumber } from "@/lib/utils";
import { getOrgContext } from "@/server/session";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getOrgContext((await params).slug);
  const overview = await getOverview(container, ctx);
  const base = `/o/${ctx.organization.slug}`;
  const firstName = ctx.actor.name.split(" ")[0];
  const limit = overview.plan.limits.eventsPerMonth;
  const hasEvents = overview.last30.events > 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here's what's happening in ${ctx.organization.name} over the last 30 days.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/analytics`}>
              Open analytics <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events (30d)" value={formatNumber(overview.last30.events, { compact: true })} delta={overview.last30.eventsChange} icon={Activity} />
        <StatCard label="Unique users (30d)" value={formatNumber(overview.last30.users, { compact: true })} delta={overview.last30.usersChange} icon={Users} />
        <StatCard label="Team members" value={overview.members} hint={overview.plan.limits.members ? `of ${overview.plan.limits.members} seats` : "Unlimited seats"} icon={Users} />
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Monthly usage</p>
            <Gauge className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(overview.eventsThisMonth, { compact: true })}</p>
          <div className="mt-2 grid gap-1.5">
            <Meter value={overview.eventsThisMonth} max={limit} label="Events this month" />
            <p className="text-xs text-muted-foreground">
              {limit === null ? "Unlimited" : `of ${formatNumber(limit, { compact: true })} events`} · {overview.plan.name} plan
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Events per day</CardTitle>
            <CardDescription>Last 30 days, UTC</CardDescription>
          </CardHeader>
          <CardContent>
            {hasEvents ? (
              <TrendChart data={overview.series.map((point) => ({ date: point.date, value: point.events }))} label="Events" />
            ) : (
              <QuickStart base={base} canManageKeys={can(ctx, "api_keys:manage")} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Changes made by your team</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentActivity === null ? (
              <EmptyState
                icon={Activity}
                title={can(ctx, "audit_log:read") ? "Audit log is a Pro feature" : "No access"}
                description={can(ctx, "audit_log:read") ? "Upgrade to see who changed what, and when." : "Ask an admin for access to the audit log."}
                action={
                  can(ctx, "billing:read") && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${base}/billing`}>View plans</Link>
                    </Button>
                  )
                }
                className="py-6"
              />
            ) : overview.recentActivity.length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet" className="py-6" />
            ) : (
              <div className="grid gap-4">
                <ActivityFeed entries={overview.recentActivity} />
                <Button asChild variant="ghost" size="sm" className="justify-self-start">
                  <Link href={`${base}/activity`}>
                    View all <ArrowRight />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function QuickStart({ base, canManageKeys }: { base: string; canManageKeys: boolean }) {
  const snippet = `curl -X POST ${env.APP_URL}/api/v1/events \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"signup","distinctId":"user_42"}'`;
  return (
    <div className="grid gap-4">
      <EmptyState
        icon={Terminal}
        title="Send your first event"
        description="Create an API key, then send events from your backend. They'll show up here in real time."
        action={
          canManageKeys && (
            <Button asChild size="sm">
              <Link href={`${base}/api-keys`}>
                <KeyRound /> Create API key
              </Link>
            </Button>
          )
        }
        className="py-6"
      />
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">{snippet}</pre>
    </div>
  );
}
