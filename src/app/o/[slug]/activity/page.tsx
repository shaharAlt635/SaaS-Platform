import { ArrowRight, ScrollText, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/application/context";
import { listAuditLog } from "@/application/use-cases/audit-log";
import { AccessDenied, EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlanLimitError } from "@/domain/errors";
import { ActivityFeed } from "@/features/audit/components/activity-feed";
import { container } from "@/infrastructure/container";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const ctx = await getOrgContext((await params).slug);
  if (!can(ctx, "audit_log:read")) return <AccessDenied title="Audit log" />;
  const { cursor } = await searchParams;
  const base = `/o/${ctx.organization.slug}`;

  let page;
  try {
    page = await listAuditLog(container, ctx, { cursor, limit: 25 });
  } catch (error) {
    if (!(error instanceof PlanLimitError)) throw error;
    return (
      <>
        <PageHeader title="Audit log" />
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Unlock the audit log"
            description={error.message}
            action={
              can(ctx, "billing:read") && (
                <Button asChild size="sm">
                  <Link href={`${base}/billing`}>Upgrade plan</Link>
                </Button>
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Audit log" description="A record of security-relevant changes in this organization." />
      <Card>
        <CardContent>
          {page.items.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nothing here yet" description="Changes to members, keys, settings and billing appear here." />
          ) : (
            <div className="grid gap-6">
              <ActivityFeed entries={page.items} />
              <div className="flex gap-2 border-t pt-4">
                {cursor && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}/activity`}>Newest</Link>
                  </Button>
                )}
                {page.nextCursor && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}/activity?cursor=${page.nextCursor}`}>
                      Older <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
