import type { ApiKeyRepository } from "@/application/ports";
import type { ApiKey } from "@/domain/entities";
import type { Database } from "../db";

const select = {
  id: true,
  organizationId: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: Database) {}

  list(organizationId: string): Promise<ApiKey[]> {
    return this.db.apiKey.findMany({
      where: { organizationId },
      orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      select,
    });
  }

  countActive(organizationId: string): Promise<number> {
    return this.db.apiKey.count({ where: { organizationId, revokedAt: null } });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.db.apiKey.findUnique({ where: { id }, select });
  }

  findActiveByHash(keyHash: string): Promise<ApiKey | null> {
    return this.db.apiKey.findFirst({ where: { keyHash, revokedAt: null }, select });
  }

  create(data: { organizationId: string; name: string; prefix: string; keyHash: string; createdById: string }): Promise<ApiKey> {
    return this.db.apiKey.create({ data, select });
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db.apiKey.update({ where: { id }, data: { revokedAt: at } });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.apiKey.update({ where: { id }, data: { lastUsedAt: at } });
  }
}
