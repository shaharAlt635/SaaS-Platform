import type { AnalyticsRepository } from "@/application/ports";
import type { DailyPoint, Window } from "@/domain/analytics";
import type { StoredEvent, TrackedEvent } from "@/domain/entities";
import { Prisma } from "@/generated/prisma/client";
import type { Database } from "../db";

const EVENTS_METRIC = "events";

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Database) {}

  async ingest(organizationId: string, events: TrackedEvent[], period: string): Promise<void> {
    await this.db.$transaction([
      this.db.event.createMany({
        data: events.map((event) => ({
          organizationId,
          name: event.name,
          distinctId: event.distinctId,
          properties: event.properties === null ? Prisma.DbNull : (event.properties as Prisma.InputJsonObject),
          occurredAt: event.occurredAt,
        })),
      }),
      this.db.usageCounter.upsert({
        where: { organizationId_metric_period: { organizationId, metric: EVENTS_METRIC, period } },
        create: { organizationId, metric: EVENTS_METRIC, period, value: events.length },
        update: { value: { increment: events.length } },
      }),
    ]);
  }

  async usage(organizationId: string, period: string): Promise<number> {
    const counter = await this.db.usageCounter.findUnique({
      where: { organizationId_metric_period: { organizationId, metric: EVENTS_METRIC, period } },
      select: { value: true },
    });
    return counter?.value ?? 0;
  }

  async totals(organizationId: string, { from, to }: Window): Promise<{ events: number; users: number }> {
    const [row] = await this.db.$queryRaw<Array<{ events: number; users: number }>>`
      SELECT count(*)::int AS events, count(DISTINCT "distinctId")::int AS users
      FROM events
      WHERE "organizationId" = ${organizationId} AND "occurredAt" >= ${from} AND "occurredAt" < ${to}`;
    return row ?? { events: 0, users: 0 };
  }

  daily(organizationId: string, { from, to }: Window): Promise<DailyPoint[]> {
    return this.db.$queryRaw<DailyPoint[]>`
      SELECT to_char(date_trunc('day', "occurredAt"), 'YYYY-MM-DD') AS date,
             count(*)::int AS events,
             count(DISTINCT "distinctId")::int AS users
      FROM events
      WHERE "organizationId" = ${organizationId} AND "occurredAt" >= ${from} AND "occurredAt" < ${to}
      GROUP BY 1
      ORDER BY 1`;
  }

  async topEvents(organizationId: string, { from, to }: Window, limit: number) {
    const rows = await this.db.event.groupBy({
      by: ["name"],
      where: { organizationId, occurredAt: { gte: from, lt: to } },
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
      take: limit,
    });
    return rows.map((row) => ({ name: row.name, count: row._count._all }));
  }

  async recent(
    organizationId: string,
    { since, limit, cursor, name }: { since: Date; limit: number; cursor?: string; name?: string },
  ): Promise<{ items: StoredEvent[]; nextCursor: string | null }> {
    const rows = await this.db.event.findMany({
      where: { organizationId, createdAt: { gte: since }, ...(name ? { name } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, name: true, distinctId: true, properties: true, occurredAt: true, createdAt: true },
    });
    const items = rows.slice(0, limit).map(({ createdAt, properties, ...row }) => ({
      ...row,
      properties: (properties as Record<string, unknown> | null) ?? null,
      receivedAt: createdAt,
    }));
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
  }

  async eventNames(organizationId: string, since: Date): Promise<string[]> {
    const rows = await this.db.event.groupBy({
      by: ["name"],
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => row.name);
  }
}
