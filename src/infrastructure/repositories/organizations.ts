import type { OrganizationRepository } from "@/application/ports";
import type { Organization } from "@/domain/entities";
import type { Database } from "../db";

const select = { id: true, name: true, slug: true, stripeCustomerId: true, createdAt: true } as const;

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Database) {}

  findById(id: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { id }, select });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { slug }, select });
  }

  findByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { stripeCustomerId }, select });
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.db.organization.count({ where: { slug } })) > 0;
  }

  createWithOwner(data: { name: string; slug: string }, ownerUserId: string): Promise<Organization> {
    return this.db.organization.create({
      data: { ...data, memberships: { create: { userId: ownerUserId, role: "OWNER" } } },
      select,
    });
  }

  update(id: string, data: Partial<Pick<Organization, "name" | "slug" | "stripeCustomerId">>): Promise<Organization> {
    return this.db.organization.update({ where: { id }, data, select });
  }

  async delete(id: string): Promise<void> {
    await this.db.organization.delete({ where: { id } });
  }

  async listForUser(userId: string) {
    const memberships = await this.db.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { role: true, organization: { select } },
    });
    return memberships.map(({ role, organization }) => ({ ...organization, role }));
  }
}
