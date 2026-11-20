"use server";

import { revalidatePath } from "next/cache";
import { inviteMember, revokeInvitation } from "@/application/use-cases/invitations";
import { changeMemberRole, removeMember } from "@/application/use-cases/members";
import type { InviteMemberInput } from "@/domain/validation";
import type { Role } from "@/domain/rbac";
import { container } from "@/infrastructure/container";
import { runAction } from "@/server/action";
import { getOrgContext } from "@/server/session";

const refresh = (slug: string) => revalidatePath(`/o/${slug}/members`);

export async function inviteMemberAction(slug: string, input: InviteMemberInput) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    const { invitation, inviteUrl } = await inviteMember(container, ctx, input);
    refresh(slug);
    return { email: invitation.email, inviteUrl };
  });
}

export async function revokeInvitationAction(slug: string, id: string) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    await revokeInvitation(container, ctx, { id });
    refresh(slug);
    return null;
  });
}

export async function changeMemberRoleAction(slug: string, membershipId: string, role: Role) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    await changeMemberRole(container, ctx, { membershipId, role });
    refresh(slug);
    return null;
  });
}

export async function removeMemberAction(slug: string, id: string) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    await removeMember(container, ctx, { id });
    refresh(slug);
    return null;
  });
}
