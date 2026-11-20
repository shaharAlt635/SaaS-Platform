"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvitation } from "@/application/use-cases/invitations";
import { leaveOrganization } from "@/application/use-cases/members";
import { createOrganization, deleteOrganization, updateOrganization } from "@/application/use-cases/organizations";
import type { CreateOrganizationInput, UpdateOrganizationInput } from "@/domain/validation";
import { container } from "@/infrastructure/container";
import { runAction } from "@/server/action";
import { getOrgContext, requireActor } from "@/server/session";

export async function createOrganizationAction(input: CreateOrganizationInput) {
  return runAction(async () => {
    const actor = await requireActor();
    const organization = await createOrganization(container, actor, input);
    return { slug: organization.slug };
  });
}

export async function updateOrganizationAction(slug: string, input: UpdateOrganizationInput) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    const organization = await updateOrganization(container, ctx, input);
    revalidatePath(`/o/${organization.slug}`, "layout");
    return { slug: organization.slug };
  });
}

export async function deleteOrganizationAction(slug: string, confirmation: string) {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(slug);
    await deleteOrganization(container, ctx, { confirmation });
    return null;
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

export async function leaveOrganizationAction(slug: string) {
  const result = await runAction(async () => {
    const ctx = await getOrgContext(slug);
    await leaveOrganization(container, ctx);
    return null;
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

export async function acceptInvitationAction(token: string) {
  const result = await runAction(async () => {
    const actor = await requireActor();
    return acceptInvitation(container, actor, token);
  });
  if (result.ok) redirect(`/o/${result.data.slug}`);
  return result;
}
