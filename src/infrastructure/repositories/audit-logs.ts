import type { AuditLogRepository } from "@/application/ports";
import type { AuditLogEntry } from "@/domain/entities";
import type { Prisma } from "@/generated/prisma/client";
import type { Database } from "../db";

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Database) {}

  async record(entry: {
    organizationId: string;
    actorId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.auditLog.create({
      data: { ...entry, metadata: entry.metadata as Prisma.InputJsonObject | undefined },
    });
  }

  async list(organizationId: string, { limit, cursor }: { limit: number; cursor?: string }) {
    const rows = await this.db.auditLog.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items: AuditLogEntry[] = rows.slice(0, limit).map((row) => ({
      ...row,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
}
