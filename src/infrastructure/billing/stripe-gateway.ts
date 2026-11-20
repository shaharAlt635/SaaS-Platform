import "server-only";
import Stripe from "stripe";
import type { BillingGateway, BillingWebhookEvent, ProviderSubscription } from "@/application/ports";
import type { SubscriptionStatus } from "@/domain/billing";
import type { BillingInterval, PaidPlanId } from "@/domain/plans";

export interface PriceCatalog {
  PRO: Record<BillingInterval, string | undefined>;
  BUSINESS: Record<BillingInterval, string | undefined>;
}

const STATUS_MAP: Partial<Record<string, SubscriptionStatus>> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

export class StripeBillingGateway implements BillingGateway {
  readonly enabled = true;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
    private readonly prices: PriceCatalog,
  ) {
    this.stripe = new Stripe(secretKey, { appInfo: { name: "saas-platform" }, maxNetworkRetries: 2 });
  }

  priceFor(plan: PaidPlanId, interval: BillingInterval): string | null {
    return this.prices[plan][interval] ?? null;
  }

  resolvePrice(priceId: string): { plan: PaidPlanId; interval: BillingInterval } | null {
    for (const plan of ["PRO", "BUSINESS"] as const) {
      for (const interval of ["MONTH", "YEAR"] as const) {
        if (this.prices[plan][interval] === priceId) return { plan, interval };
      }
    }
    return null;
  }

  async createCustomer(input: { organizationId: string; name: string; email: string }): Promise<string> {
    const customer = await this.stripe.customers.create(
      { name: input.name, email: input.email, metadata: { organizationId: input.organizationId } },
      { idempotencyKey: `customer-${input.organizationId}` },
    );
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    organizationId: string;
    priceId: string;
    trialDays: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.organizationId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      subscription_data: {
        metadata: { organizationId: input.organizationId },
        ...(input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return session.url;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent | null> {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

    let subscriptionId: string | null = null;
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
    }
    if (!subscriptionId) return null;

    // Always fetch the latest state so out-of-order deliveries can't regress the subscription.
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    return { id: event.id, type: event.type, subscription: this.normalize(subscription) };
  }

  private normalize(subscription: Stripe.Subscription): ProviderSubscription {
    const item = subscription.items.data[0];
    if (!item) throw new Error(`Subscription ${subscription.id} has no items`);
    return {
      id: subscription.id,
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      organizationId: subscription.metadata.organizationId ?? null,
      priceId: item.price.id,
      status: STATUS_MAP[subscription.status] ?? "INCOMPLETE",
      currentPeriodStart: toDate(item.current_period_start),
      currentPeriodEnd: toDate(item.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
      trialEnd: toDate(subscription.trial_end),
    };
  }
}

/** Used when Stripe isn't configured: the app runs fine on the Free plan. */
export class DisabledBillingGateway implements BillingGateway {
  readonly enabled = false;
  priceFor() {
    return null;
  }
  resolvePrice() {
    return null;
  }
  private unavailable(): never {
    throw new Error("Billing is not configured");
  }
  createCustomer(): Promise<string> {
    return this.unavailable();
  }
  createCheckoutSession(): Promise<string> {
    return this.unavailable();
  }
  createPortalSession(): Promise<string> {
    return this.unavailable();
  }
  async cancelSubscription(): Promise<void> {}
  parseWebhook(): Promise<null> {
    return this.unavailable();
  }
}
