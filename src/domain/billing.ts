import type { BillingInterval, PaidPlanId, PlanId } from "./plans";

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "UNPAID",
  "PAUSED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Subscription {
  id: string;
  organizationId: string;
  plan: PaidPlanId;
  status: SubscriptionStatus;
  interval: BillingInterval;
  stripeSubscriptionId: string;
  stripePriceId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
}

/** Statuses that keep paid entitlements. PAST_DUE is a grace period while Stripe retries payment. */
const ENTITLED: ReadonlySet<SubscriptionStatus> = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTITLED.has(status);
}

export function effectivePlan(subscription: Pick<Subscription, "plan" | "status"> | null): PlanId {
  return subscription && isEntitled(subscription.status) ? subscription.plan : "FREE";
}

export function billingPeriod(date: Date): string {
  return date.toISOString().slice(0, 7); // "YYYY-MM" in UTC
}
