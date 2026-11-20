import type { InvitationRepository, InvitationWithOrganization } from "@/application/ports";
import type { Invitation, Membership } from "@/domain/entities";
import type { Role } from "@/domain/rbac";
import type { Database } from "../db";

const select = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { name: true, email: true } },
} as const;

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly db: Database) {}

  upsert(data: {
    organizationId: string;
    email: string;
    role: Role;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
  }): Promise<Invitation> {
    const { organizationId, email, ...rest } = data;
    return this.db.invitation.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: data,
      update: { ...rest, createdAt: new Date() },
      select,
    });
  }

  findById(id: string): Promise<Invitation | null> {
    return this.db.invitation.findUnique({ where: { id }, select });
  }

  findByTokenHash(tokenHash: string): Promise<InvitationWithOrganization | null> {
    return this.db.invitation.findUnique({
      where: { tokenHash },
      select: {
        ...select,
        organization: { select: { id: true, name: true, slug: true, stripeCustomerId: true, createdAt: true } },
      },
    });
  }

  listPending(organizationId: string, now: Date): Promise<Invitation[]> {
    return this.db.invitation.findMany({
      where: { organizationId, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select,
    });
  }

  countPending(organizationId: string, now: Date): Promise<number> {
    return this.db.invitation.count({ where: { organizationId, expiresAt: { gt: now } } });
  }

  async delete(id: string): Promise<void> {
    await this.db.invitation.deleteMany({ where: { id } });
  }

  accept(invitationId: string, userId: string): Promise<Membership> {
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.invitation.delete({ where: { id: invitationId } });
      return tx.membership.create({
        data: { organizationId: invitation.organizationId, userId, role: invitation.role },
        select: { id: true, organizationId: true, userId: true, role: true },
      });
    });
  }
}
