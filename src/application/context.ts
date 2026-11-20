import type { Organization } from "@/domain/entities";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { hasPermission, type Permission, type Role } from "@/domain/rbac";
import type { Dependencies } from "./ports";

/** The authenticated user performing an operation. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
}

/** An actor operating inside a specific organization. */
export interface OrgContext {
  actor: Actor;
  organization: Organization;
  membership: { id: string; role: Role };
}

export function authorize(ctx: OrgContext, permission: Permission): void {
  if (!hasPermission(ctx.membership.role, permission)) {
    throw new ForbiddenError();
  }
}

export const READ_ONLY_MESSAGE =
  "This is a shared demo workspace, so changes are disabled. Create your own organization to try everything.";

export function isReadOnly(deps: Pick<Dependencies, "config">, ctx: OrgContext): boolean {
  return deps.config.readOnlyOrganizationSlugs.includes(ctx.organization.slug);
}

/** Blocks mutations in read-only organizations, independently of the actor's role. */
export function assertWritable(deps: Pick<Dependencies, "config">, ctx: OrgContext): void {
  if (isReadOnly(deps, ctx)) throw new ForbiddenError(READ_ONLY_MESSAGE);
}

export function can(ctx: OrgContext, permission: Permission): boolean {
  return hasPermission(ctx.membership.role, permission);
}

/**
 * Resolves the organization by slug and the actor's membership in it.
 * Non-members get NOT_FOUND (not FORBIDDEN) so organization existence isn't leaked.
 */
export async function resolveOrgContext(
  deps: Pick<Dependencies, "organizations" | "memberships">,
  actor: Actor,
  slug: string,
): Promise<OrgContext> {
  const organization = await deps.organizations.findBySlug(slug);
  if (!organization) throw new NotFoundError("Organization");
  const membership = await deps.memberships.find(organization.id, actor.userId);
  if (!membership) throw new NotFoundError("Organization");
  return { actor, organization, membership: { id: membership.id, role: membership.role } };
}
