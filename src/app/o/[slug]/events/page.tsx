import { ArrowRight, KeyRound, Rows3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/application/context";
import { listEvents } from "@/application/use-cases/analytics";
import { RefreshButton, SearchParamSelect } from "@/components/client";
import { EmptyState, PageHeader, RelativeTime } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { container } from "@/infrastructure/container";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Events" };

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string; cursor?: string }>;
}) {
  const ctx = await getOrgContext((await params).slug);
  const query = await searchParams;
  const page = await listEvents(container, ctx, query);
  const base = `/o/${ctx.organization.slug}`;
  const filter = page.name ? `name=${encodeURIComponent(page.name)}` : "";
  const olderHref = page.nextCursor ? `${base}/events?${filter ? `${filter}&` : ""}cursor=${page.nextCursor}` : null;

  return (
    <>
      <PageHeader
        title="Events"
        description={`Every event your API keys have sent, newest first · last ${page.historyDays} days on your plan.`}
        actions={
          <>
            <SearchParamSelect param="name" label="Filter by event name" options={page.names} allLabel="All events" />
            <RefreshButton />
          </>
        }
      />

      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState
            icon={Rows3}
            title={page.name ? `No “${page.name}” events yet` : "No events yet"}
            description="Send an event with an API key and it appears here — press Refresh to check."
            action={
              can(ctx, "api_keys:read") && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/api-keys`}>
                    <KeyRound /> API keys
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Properties</TableHead>
                <TableHead className="hidden sm:table-cell">Occurred</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((event) => {
                const properties = Object.entries(event.properties ?? {});
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Link href={`${base}/events?name=${encodeURIComponent(event.name)}`} className="font-mono text-xs hover:text-primary hover:underline">
                        {event.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                      {event.distinctId ?? <span className="font-sans italic">anonymous</span>}
                    </TableCell>
                    <TableCell className="hidden max-w-80 md:table-cell">
                      {properties.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {properties.slice(0, 4).map(([key, value]) => (
                            <code key={key} className="max-w-56 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                              {key}: {formatValue(value)}
                            </code>
                          ))}
                          {properties.length > 4 && <span className="text-xs text-muted-foreground">+{properties.length - 4}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      <RelativeTime date={event.occurredAt} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <RelativeTime date={event.receivedAt} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {(query.cursor || olderHref) && (
        <div className="mt-4 flex gap-2">
          {query.cursor && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/events${filter ? `?${filter}` : ""}`}>Newest</Link>
            </Button>
          )}
          {olderHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={olderHref}>
                Older <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
