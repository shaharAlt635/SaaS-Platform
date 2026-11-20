import type { Metadata } from "next";
import { can } from "@/application/context";
import { getOrganizationPlan } from "@/application/use-cases/billing";
import { listInvitations } from "@/application/use-cases/invitations";
import { listMembers } from "@/application/use-cases/members";
import { PageHeader } from "@/components/shared";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, remaining } from "@/domain/plans";
import { InviteMemberDialog, MembersTable, PendingInvitations } from "@/features/members/components/members";
import { container } from "@/infrastructure/container";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getOrgContext((await params).slug);
  const [members, invitations, plan] = await Promise.all([
    listMembers(container, ctx),
    listInvitations(container, ctx),
    getOrganizationPlan(container, ctx.organization.id),
  ]);
  const limit = PLANS[plan].limits.members;
  const seatsLeft = remaining(limit, members.length + invitations.length);
  const slug = ctx.organization.slug;

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} member${members.length === 1 ? "" : "s"}${limit === null ? "" : ` · ${limit} seats on the ${PLANS[plan].name} plan`}`}
        actions={can(ctx, "members:invite") && <InviteMemberDialog slug={slug} viewerRole={ctx.membership.role} seatsLeft={seatsLeft} />}
      />
      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <MembersTable
            members={members.map((member) => ({ ...member, joinedAt: member.joinedAt.toISOString() }))}
            viewer={{
              slug,
              userId: ctx.actor.userId,
              role: ctx.membership.role,
              canUpdate: can(ctx, "members:update"),
              canRemove: can(ctx, "members:remove"),
            }}
          />
        </Card>

        {invitations.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-4 sm:pb-4">
              <CardTitle>Pending invitations</CardTitle>
              <CardDescription>Invitations count toward your seat limit until they expire.</CardDescription>
            </CardHeader>
            <PendingInvitations
              slug={slug}
              canRevoke={can(ctx, "members:invite")}
              invitations={invitations.map((invitation) => ({
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                createdAt: invitation.createdAt.toISOString(),
                expiresAt: invitation.expiresAt.toISOString(),
                invitedBy: invitation.invitedBy?.name ?? null,
              }))}
            />
          </Card>
        )}
      </div>
    </>
  );
}
