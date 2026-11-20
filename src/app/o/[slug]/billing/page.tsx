import type { Metadata } from "next";
import { can } from "@/application/context";
import { getBillingOverview } from "@/application/use-cases/billing";
import { AccessDenied, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Meter } from "@/components/ui/misc";
import type { SubscriptionStatus } from "@/domain/billing";
import { ManageBillingButton } from "@/features/billing/components/manage-billing-button";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { container } from "@/infrastructure/container";
import { formatDate, formatNumber } from "@/lib/utils";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Billing" };

const STATUS: Record<SubscriptionStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  TRIALING: { label: "Trial", variant: "success" },
  PAST_DUE: { label: "Past due", variant: "warning" },
  UNPAID: { label: "Unpaid", variant: "destructive" },
  INCOMPLETE: { label: "Incomplete", variant: "warning" },
  INCOMPLETE_EXPIRED: { label: "Expired", variant: "secondary" },
  CANCELED: { label: "Canceled", variant: "secondary" },
  PAUSED: { label: "Paused", variant: "secondary" },
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const ctx = await getOrgContext((await params).slug);
  if (!can(ctx, "billing:read")) return <AccessDenied title="Billing" />;
  const [billing, { checkout }] = await Promise.all([getBillingOverview(container, ctx), searchParams]);
  const { plan, subscription, usage } = billing;
  const status = subscription ? STATUS[subscription.status] : null;
  const hasPaidSubscription = plan.id !== "FREE";

  const meters = [
    { label: "Team members", value: usage.members, max: plan.limits.members, hint: "Including pending invitations" },
    { label: "Events this month", value: usage.eventsThisMonth, max: plan.limits.eventsPerMonth, hint: "Resets on the 1st (UTC)" },
    { label: "Active API keys", value: usage.apiKeys, max: plan.limits.apiKeys, hint: "Revoked keys don't count" },
  ];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage your plan, usage and invoices."
        actions={billing.enabled && billing.canManage && ctx.organization.stripeCustomerId && <ManageBillingButton slug={ctx.organization.slug} />}
      />

      <div className="grid gap-4">
        {checkout === "success" && (
          <Alert title="Thanks for subscribing!">Your plan will update as soon as payment is confirmed — usually within a few seconds.</Alert>
        )}
        {!billing.enabled && (
          <Alert variant="warning" title="Billing isn't configured">
            Set <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> and the price IDs to enable upgrades.
          </Alert>
        )}
        {subscription?.status === "PAST_DUE" && (
          <Alert variant="warning" title="Your last payment failed">
            Update your payment method to keep your {plan.name} features.
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {plan.name}
                {status && hasPaidSubscription && <Badge variant={status.variant}>{status.label}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm text-muted-foreground">
              {!hasPaidSubscription && <p>Free forever. Upgrade any time.</p>}
              {subscription && hasPaidSubscription && (
                <>
                  <p>Billed {subscription.interval === "MONTH" ? "monthly" : "yearly"}.</p>
                  {subscription.status === "TRIALING" && subscription.trialEndsAt && <p>Trial ends {formatDate(subscription.trialEndsAt)}.</p>}
                  {subscription.currentPeriodEnd && (
                    <p>
                      {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on {formatDate(subscription.currentPeriodEnd)}.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>Your consumption against {plan.name} plan limits.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-3">
              {meters.map((meter) => (
                <div key={meter.label} className="grid gap-2">
                  <p className="text-sm text-muted-foreground">{meter.label}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatNumber(meter.value, { compact: true })}
                    <span className="text-sm font-normal text-muted-foreground"> / {meter.max === null ? "∞" : formatNumber(meter.max, { compact: true })}</span>
                  </p>
                  <Meter value={meter.value} max={meter.max} label={meter.label} />
                  <p className="text-xs text-muted-foreground">{meter.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="plans-heading" className="mt-4 grid gap-4">
          <div>
            <h2 id="plans-heading" className="text-lg font-semibold tracking-tight">
              Plans
            </h2>
            {!billing.canManage && <p className="text-sm text-muted-foreground">Only owners can change the plan.</p>}
          </div>
          <PricingTable
            mode="billing"
            slug={ctx.organization.slug}
            currentPlan={plan.id}
            hasSubscription={hasPaidSubscription}
            canManage={billing.canManage}
            billingEnabled={billing.enabled}
          />
        </section>
      </div>
    </>
  );
}
