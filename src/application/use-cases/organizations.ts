import { isEntitled } from "@/domain/billing";
import type { Organization } from "@/domain/entities";
import { ConflictError, ValidationError } from "@/domain/errors";
import type { Role } from "@/domain/rbac";
import { isReservedSlug, slugify } from "@/domain/slug";
import {
  createOrganizationSchema,
  deleteOrganizationSchema,
  parseInput,
  updateOrganizationSchema,
} from "@/domain/validation";
import { audit } from "../audit";
import { type Actor, authorize, type OrgContext } from "../context";
import { generateToken } from "../crypto";
import type { Dependencies } from "../ports";

type Deps = Pick<Dependencies, "organizations" | "auditLogs" | "logger">;

async function availableSlug(deps: Deps, base: string): Promise<string> {
  const root = base.length >= 3 && !isReservedSlug(base) ? base : `${base || "org"}-team`;
  if (!(await deps.organizations.slugExists(root))) return root;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${root.slice(0, 42)}-${generateToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)}`;
    if (!(await deps.organizations.slugExists(candidate))) return candidate;
  }
  throw new ConflictError("Couldn't generate a unique URL. Please choose one manually.");
}

export async function createOrganization(deps: Deps, actor: Actor, input: unknown): Promise<Organization> {
  const { name, slug: requested } = parseInput(createOrganizationSchema, input);

  let slug: string;
  if (requested) {
    if (await deps.organizations.slugExists(requested)) throw new ConflictError("That URL is already taken.");
    slug = requested;
  } else {
    slug = await availableSlug(deps, slugify(name));
  }

  const organization = await deps.organizations.createWithOwner({ name, slug }, actor.userId);
  await audit(deps, { organizationId: organization.id, actorId: actor.userId }, "organization.created", {
    targetType: "organization",
    targetId: organization.id,
    metadata: { name },
  });
  return organization;
}

export function listOrganizations(deps: Pick<Dependencies, "organizations">, actor: Actor): Promise<Array<Organization & { role: Role }>> {
  return deps.organizations.listForUser(actor.userId);
}

export async function updateOrganization(deps: Deps, ctx: OrgContext, input: unknown): Promise<Organization> {
  authorize(ctx, "organization:update");
  const data = parseInput(updateOrganizationSchema, input);
  const current = ctx.organization;

  if (data.slug !== current.slug && (await deps.organizations.slugExists(data.slug))) {
    throw new ValidationError("That URL is already taken.", { slug: ["That URL is already taken."] });
  }

  const updated = await deps.organizations.update(current.id, data);
  const changes = Object.fromEntries(
    (["name", "slug"] as const)
      .filter((key) => current[key] !== updated[key])
      .map((key) => [key, { from: current[key], to: updated[key] }]),
  );
  if (Object.keys(changes).length > 0) {
    await audit(deps, ctx, "organization.updated", { targetType: "organization", targetId: current.id, metadata: changes });
  }
  return updated;
}

export async function deleteOrganization(
  deps: Pick<Dependencies, "organizations" | "subscriptions" | "billing" | "logger">,
  ctx: OrgContext,
  input: unknown,
): Promise<void> {
  authorize(ctx, "organization:delete");
  const { confirmation } = parseInput(deleteOrganizationSchema, input);
  if (confirmation !== ctx.organization.slug) {
    throw new ValidationError("Confirmation doesn't match.", { confirmation: [`Type "${ctx.organization.slug}" to confirm.`] });
  }

  // Stop charging before the data that references the subscription disappears.
  const subscription = await deps.subscriptions.findByOrganization(ctx.organization.id);
  if (subscription && isEntitled(subscription.status) && deps.billing.enabled) {
    await deps.billing.cancelSubscription(subscription.stripeSubscriptionId);
  }

  await deps.organizations.delete(ctx.organization.id);
  deps.logger.info("Organization deleted", { organizationId: ctx.organization.id, actorId: ctx.actor.userId });
}
