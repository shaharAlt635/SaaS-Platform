import type { Invitation, Organization } from "@/domain/entities";
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { assertWithinLimit, PLANS } from "@/domain/plans";
import { canAssignRole, type Role } from "@/domain/rbac";
import { idSchema, inviteMemberSchema, parseInput } from "@/domain/validation";
import { audit } from "../audit";
import { type Actor, authorize, type OrgContext } from "../context";
import { generateToken, hashToken } from "../crypto";
import { invitationEmail } from "../emails";
import type { Dependencies } from "../ports";
import { getOrganizationPlan } from "./billing";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteMember(
  deps: Pick<Dependencies, "memberships" | "invitations" | "subscriptions" | "mailer" | "auditLogs" | "logger" | "config" | "clock">,
  ctx: OrgContext,
  input: unknown,
): Promise<{ invitation: Invitation; inviteUrl: string }> {
  authorize(ctx, "members:invite");
  const { email, role } = parseInput(inviteMemberSchema, input);
  const organizationId = ctx.organization.id;
  const now = deps.clock();

  if (!canAssignRole(ctx.membership.role, role)) {
    throw new ForbiddenError("You can't invite someone with a higher role than your own.");
  }
  if (await deps.memberships.isMemberByEmail(organizationId, email)) {
    throw new ConflictError(`${email} is already a member of this organization.`);
  }

  // Seats = members + pending invitations. Re-sending an invite doesn't take another seat.
  const [plan, members, pending] = await Promise.all([
    getOrganizationPlan(deps, organizationId),
    deps.memberships.count(organizationId),
    deps.invitations.listPending(organizationId, now),
  ]);
  const alreadyInvited = pending.some((invitation) => invitation.email === email);
  assertWithinLimit(PLANS[plan].limits.members, members + pending.length, alreadyInvited ? 0 : 1, "team members");

  const token = generateToken();
  const invitation = await deps.invitations.upsert({
    organizationId,
    email,
    role,
    tokenHash: hashToken(token),
    invitedById: ctx.actor.userId,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
  });

  const inviteUrl = `${deps.config.appUrl}/invite/${token}`;
  await deps.mailer.send({
    to: email,
    ...invitationEmail({
      appName: deps.config.appName,
      organizationName: ctx.organization.name,
      inviterName: ctx.actor.name,
      role,
      url: inviteUrl,
    }),
  });

  await audit(deps, ctx, "member.invited", { targetType: "invitation", targetId: invitation.id, metadata: { email, role } });
  return { invitation, inviteUrl };
}

export function listInvitations(deps: Pick<Dependencies, "invitations" | "clock">, ctx: OrgContext): Promise<Invitation[]> {
  authorize(ctx, "members:read");
  return deps.invitations.listPending(ctx.organization.id, deps.clock());
}

export async function revokeInvitation(
  deps: Pick<Dependencies, "invitations" | "auditLogs" | "logger">,
  ctx: OrgContext,
  input: unknown,
): Promise<void> {
  authorize(ctx, "members:invite");
  const { id } = parseInput(idSchema, input);
  const invitation = await deps.invitations.findById(id);
  if (!invitation || invitation.organizationId !== ctx.organization.id) throw new NotFoundError("Invitation");
  await deps.invitations.delete(id);
  await audit(deps, ctx, "invitation.revoked", { targetType: "invitation", targetId: id, metadata: { email: invitation.email } });
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: Role;
  invitedBy: string | null;
  expired: boolean;
}

/** Public lookup used by the invitation landing page. */
export async function previewInvitation(
  deps: Pick<Dependencies, "invitations" | "clock">,
  token: string,
): Promise<InvitationPreview | null> {
  const invitation = await deps.invitations.findByTokenHash(hashToken(token));
  if (!invitation) return null;
  return {
    organizationName: invitation.organization.name,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy?.name ?? null,
    expired: invitation.expiresAt <= deps.clock(),
  };
}

export async function acceptInvitation(
  deps: Pick<Dependencies, "invitations" | "memberships" | "auditLogs" | "logger" | "clock">,
  actor: Actor,
  token: string,
): Promise<Organization> {
  const invitation = await deps.invitations.findByTokenHash(hashToken(token));
  if (!invitation) throw new NotFoundError("Invitation");
  if (invitation.expiresAt <= deps.clock()) throw new ConflictError("This invitation has expired. Ask an admin to send a new one.");
  if (invitation.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new ForbiddenError(`This invitation was sent to ${invitation.email}. Sign in with that email address to accept it.`);
  }

  const existing = await deps.memberships.find(invitation.organizationId, actor.userId);
  if (existing) {
    await deps.invitations.delete(invitation.id);
    return invitation.organization;
  }

  await deps.invitations.accept(invitation.id, actor.userId);
  await audit(deps, { organizationId: invitation.organizationId, actorId: actor.userId }, "member.joined", {
    targetType: "user",
    targetId: actor.userId,
    metadata: { role: invitation.role },
  });
  return invitation.organization;
}
