import type { MembershipRepository } from "@/application/ports";
import type { Member, Membership } from "@/domain/entities";
import type { Role } from "@/domain/rbac";
import type { Database } from "../db";

const select = { id: true, organizationId: true, userId: true, role: true } as const;

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Database) {}

  find(organizationId: string, userId: string): Promise<Membership | null> {
    return this.db.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select });
  }

  findById(id: string): Promise<Membership | null> {
    return this.db.membership.findUnique({ where: { id }, select });
  }

  async list(organizationId: string): Promise<Member[]> {
    const rows = await this.db.membership.findMany({
      where: { organizationId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { ...select, createdAt: true, user: { select: { id: true, name: true, email: true, image: true } } },
    });
    return rows.map(({ createdAt, ...row }) => ({ ...row, joinedAt: createdAt }));
  }

  count(organizationId: string): Promise<number> {
    return this.db.membership.count({ where: { organizationId } });
  }

  countByRole(organizationId: string, role: Role): Promise<number> {
    return this.db.membership.count({ where: { organizationId, role } });
  }

  async isMemberByEmail(organizationId: string, email: string): Promise<boolean> {
    const count = await this.db.membership.count({
      where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } },
    });
    return count > 0;
  }

  async updateRole(id: string, role: Role): Promise<void> {
    await this.db.membership.update({ where: { id }, data: { role } });
  }

  async delete(id: string): Promise<void> {
    await this.db.membership.delete({ where: { id } });
  }
}
