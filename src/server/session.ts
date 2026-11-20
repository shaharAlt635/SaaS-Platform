import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { type Actor, type OrgContext, resolveOrgContext } from "@/application/context";
import { NotFoundError } from "@/domain/errors";
import { permissionsFor } from "@/domain/rbac";
import { auth } from "@/infrastructure/auth";
import { container } from "@/infrastructure/container";

/** Deduplicated per request via React `cache`. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  if (!session) return null;
  return { userId: session.user.id, email: session.user.email, name: session.user.name };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const actor = await requireActor();
  try {
    return await resolveOrgContext(container, actor, slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});

/** Serializable view of the context for client components. */
export function toClientContext(ctx: OrgContext) {
  return {
    organization: { id: ctx.organization.id, name: ctx.organization.name, slug: ctx.organization.slug },
    role: ctx.membership.role,
    membershipId: ctx.membership.id,
    userId: ctx.actor.userId,
    permissions: permissionsFor(ctx.membership.role),
  };
}

export type ClientOrgContext = ReturnType<typeof toClientContext>;
