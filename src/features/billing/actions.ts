"use server";

import { openBillingPortal, startCheckout } from "@/application/use-cases/billing";
import type { CheckoutInput } from "@/domain/validation";
import { container } from "@/infrastructure/container";
import { runAction } from "@/server/action";
import { getOrgContext } from "@/server/session";

export async function startCheckoutAction(slug: string, input: CheckoutInput) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    return { url: await startCheckout(container, ctx, input) };
  });
}

export async function openBillingPortalAction(slug: string) {
  return runAction(async () => {
    const ctx = await getOrgContext(slug);
    return { url: await openBillingPortal(container, ctx) };
  });
}
