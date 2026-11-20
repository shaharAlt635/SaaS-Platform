"use server";

import { revalidatePath } from "next/cache";
import { createApiKey, revokeApiKey } from "@/application/use-cases/api-keys";
import { container } from "@/infrastructure/container";
import { runAction } from "@/server/action";
import { getOrgContext } from "@/server/session";

export async function createApiKeyAction(slug: string, name: string) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    const { secret, apiKey } = await createApiKey(container, ctx, { name });
    revalidatePath(`/o/${slug}/api-keys`);
    return { secret, name: apiKey.name };
  });
}

export async function revokeApiKeyAction(slug: string, id: string) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    await revokeApiKey(container, ctx, { id });
    revalidatePath(`/o/${slug}/api-keys`);
    return null;
  });
}
