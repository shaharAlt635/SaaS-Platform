import type { Member, Membership } from "@/domain/entities";
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { canAssignRole, canManageMember } from "@/domain/rbac";
import { changeRoleSchema, idSchema, parseInput } from "@/domain/validation";
import { audit } from "../audit";
import { authorize, type OrgContext } from "../context";
import type { Dependencies } from "../ports";

type Deps = Pick<Dependencies, "memberships" | "auditLogs" | "logger">;

export function listMembers(deps: Pick<Dependencies, "memberships">, ctx: OrgContext): Promise<Member[]> {
  authorize(ctx, "members:read");
  return deps.memberships.list(ctx.organization.id);
}

async function findTarget(deps: Deps, ctx: OrgContext, membershipId: string): Promise<Membership> {
  const target = await deps.memberships.findById(membershipId);
  if (!target || target.organizationId !== ctx.organization.id) throw new NotFoundError("Member");
  return target;
}

async function assertNotLastOwner(deps: Deps, target: Membership): Promise<void> {
  if (target.role !== "OWNER") return;
  const owners = await deps.memberships.countByRole(target.organizationId, "OWNER");
  if (owners <= 1) {
    throw new ConflictError("An organization needs at least one owner. Promote someone else to owner first.");
  }
}

export async function changeMemberRole(deps: Deps, ctx: OrgContext, input: unknown): Promise<void> {
  authorize(ctx, "members:update");
  const { membershipId, role } = parseInput(changeRoleSchema, input);
  const target = await findTarget(deps, ctx, membershipId);

  if (target.userId === ctx.actor.userId) throw new ForbiddenError("You can't change your own role.");
  if (!canManageMember(ctx.membership.role, target.role)) throw new ForbiddenError("You can't manage members with this role.");
  if (!canAssignRole(ctx.membership.role, role)) throw new ForbiddenError("You can't grant a role higher than your own.");
  if (target.role === role) return;

  await assertNotLastOwner(deps, target);
  await deps.memberships.updateRole(target.id, role);
  await audit(deps, ctx, "member.role_changed", {
    targetType: "user",
    targetId: target.userId,
    metadata: { from: target.role, to: role },
  });
}

export async function removeMember(deps: Deps, ctx: OrgContext, input: unknown): Promise<{ self: boolean }> {
  const { id } = parseInput(idSchema, input);
  const target = await findTarget(deps, ctx, id);
  const self = target.userId === ctx.actor.userId;

  if (!self) {
    authorize(ctx, "members:remove");
    if (!canManageMember(ctx.membership.role, target.role)) throw new ForbiddenError("You can't remove members with this role.");
  }

  await assertNotLastOwner(deps, target);
  await deps.memberships.delete(target.id);
  await audit(deps, ctx, self ? "member.left" : "member.removed", { targetType: "user", targetId: target.userId });
  return { self };
}

export function leaveOrganization(deps: Deps, ctx: OrgContext): Promise<{ self: boolean }> {
  return removeMember(deps, ctx, { id: ctx.membership.id });
}
