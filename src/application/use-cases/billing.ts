import { billingPeriod, effectivePlan, isEntitled, type Subscription } from "@/domain/billing";
import { BillingUnavailableError, ConflictError } from "@/domain/errors";
import { type Plan, type PlanId, PLANS } from "@/domain/plans";
import { checkoutSchema, parseInput } from "@/domain/validation";
import { audit } from "../audit";
import { authorize, can, type OrgContext } from "../context";
import type { Dependencies } from "../ports";

export async function getOrganizationPlan(deps: Pick<Dependencies, "subscriptions">, organizationId: string): Promise<PlanId> {
  return effectivePlan(await deps.subscriptions.findByOrganization(organizationId));
}

export interface BillingOverview {
  enabled: boolean;
  canManage: boolean;
  plan: Plan;
  subscription: Subscription | null;
  usage: { members: number; eventsThisMonth: number; apiKeys: number };
}

export async function getBillingOverview(
  deps: Pick<Dependencies, "subscriptions" | "memberships" | "invitations" | "analytics" | "apiKeys" | "billing" | "clock">,
  ctx: OrgContext,
): Promise<BillingOverview> {
  authorize(ctx, "billing:read");
  const id = ctx.organization.id;
  const now = deps.clock();
  const [subscription, members, pending, eventsThisMonth, apiKeys] = await Promise.all([
    deps.subscriptions.findByOrganization(id),
    deps.memberships.count(id),
    deps.invitations.countPending(id, now),
    deps.analytics.usage(id, billingPeriod(now)),
    deps.apiKeys.countActive(id),
  ]);
  return {
    enabled: deps.billing.enabled,
    canManage: can(ctx, "billing:manage"),
    plan: PLANS[effectivePlan(subscription)],
    subscription,
    usage: { members: members + pending, eventsThisMonth, apiKeys },
  };
}

async function ensureCustomer(deps: Pick<Dependencies, "organizations" | "billing">, ctx: OrgContext): Promise<string> {
  if (ctx.organization.stripeCustomerId) return ctx.organization.stripeCustomerId;
  const customerId = await deps.billing.createCustomer({
    organizationId: ctx.organization.id,
    name: ctx.organization.name,
    email: ctx.actor.email,
  });
  await deps.organizations.update(ctx.organization.id, { stripeCustomerId: customerId });
  return customerId;
}

export async function startCheckout(
  deps: Pick<Dependencies, "organizations" | "subscriptions" | "billing" | "auditLogs" | "logger" | "config">,
  ctx: OrgContext,
  input: unknown,
): Promise<string> {
  authorize(ctx, "billing:manage");
  if (!deps.billing.enabled) throw new BillingUnavailableError();
  const { plan, interval } = parseInput(checkoutSchema, input);

  const priceId = deps.billing.priceFor(plan, interval);
  if (!priceId) throw new BillingUnavailableError(`No Stripe price is configured for ${PLANS[plan].name} (${interval.toLowerCase()}ly).`);

  const existing = await deps.subscriptions.findByOrganization(ctx.organization.id);
  if (existing && isEntitled(existing.status)) {
    throw new ConflictError("This organization already has a subscription. Use “Manage billing” to change plans.");
  }

  const customerId = await ensureCustomer(deps, ctx);
  const base = `${deps.config.appUrl}/o/${ctx.organization.slug}/billing`;
  const url = await deps.billing.createCheckoutSession({
    customerId,
    organizationId: ctx.organization.id,
    priceId,
    // Trials are for first-time subscribers only.
    trialDays: existing ? 0 : PLANS[plan].trialDays,
    successUrl: `${base}?checkout=success`,
    cancelUrl: `${base}?checkout=canceled`,
  });
  await audit(deps, ctx, "billing.checkout_started", { metadata: { plan, interval } });
  return url;
}

export async function openBillingPortal(
  deps: Pick<Dependencies, "billing" | "config">,
  ctx: OrgContext,
): Promise<string> {
  authorize(ctx, "billing:manage");
  if (!deps.billing.enabled) throw new BillingUnavailableError();
  if (!ctx.organization.stripeCustomerId) throw new ConflictError("There's no billing account yet. Choose a plan first.");
  return deps.billing.createPortalSession({
    customerId: ctx.organization.stripeCustomerId,
    returnUrl: `${deps.config.appUrl}/o/${ctx.organization.slug}/billing`,
  });
}

export type WebhookOutcome = "processed" | "ignored" | "duplicate";

/**
 * Syncs subscription state from the billing provider. Idempotent: replays of the
 * same event are skipped, and the gateway always returns the latest subscription
 * state, so out-of-order delivery converges to the correct result.
 */
export async function handleBillingWebhook(
  deps: Pick<Dependencies, "billing" | "billingEvents" | "organizations" | "subscriptions" | "auditLogs" | "logger">,
  payload: string,
  signature: string,
): Promise<WebhookOutcome> {
  const event = await deps.billing.parseWebhook(payload, signature);
  if (!event) return "ignored";
  if (await deps.billingEvents.wasProcessed(event.id)) return "duplicate";

  const incoming = event.subscription;
  const organization =
    (incoming.organizationId ? await deps.organizations.findById(incoming.organizationId) : null) ??
    (await deps.organizations.findByStripeCustomerId(incoming.customerId));

  if (!organization) {
    deps.logger.warn("Billing webhook for unknown organization", { eventId: event.id, customerId: incoming.customerId });
    await deps.billingEvents.markProcessed(event.id, event.type);
    return "ignored";
  }

  const price = deps.billing.resolvePrice(incoming.priceId);
  if (!price) {
    // Misconfiguration: fail so the provider retries once the price is configured.
    throw new Error(`Billing webhook references unknown price ${incoming.priceId}`);
  }

  const previous = await deps.subscriptions.findByOrganization(organization.id);
  const isStale =
    previous !== null &&
    previous.stripeSubscriptionId !== incoming.id &&
    isEntitled(previous.status) &&
    !isEntitled(incoming.status);

  if (!isStale) {
    if (!organization.stripeCustomerId) {
      await deps.organizations.update(organization.id, { stripeCustomerId: incoming.customerId });
    }
    await deps.subscriptions.upsert(organization.id, {
      plan: price.plan,
      interval: price.interval,
      status: incoming.status,
      stripeSubscriptionId: incoming.id,
      stripePriceId: incoming.priceId,
      currentPeriodStart: incoming.currentPeriodStart,
      currentPeriodEnd: incoming.currentPeriodEnd,
      cancelAtPeriodEnd: incoming.cancelAtPeriodEnd,
      trialEndsAt: incoming.trialEnd,
    });
    await audit(deps, { organizationId: organization.id, actorId: null }, "billing.subscription_updated", {
      targetType: "subscription",
      targetId: incoming.id,
      metadata: { plan: price.plan, status: incoming.status, previousPlan: previous?.plan ?? "FREE" },
    });
  }

  await deps.billingEvents.markProcessed(event.id, event.type);
  return isStale ? "ignored" : "processed";
}
