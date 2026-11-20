"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type BillingInterval, PLAN_IDS, PLANS, type PaidPlanId, type PlanId } from "@/domain/plans";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { openBillingPortalAction, startCheckoutAction } from "../actions";

type Props =
  | { mode: "marketing" }
  | {
      mode: "billing";
      slug: string;
      currentPlan: PlanId;
      hasSubscription: boolean;
      canManage: boolean;
      billingEnabled: boolean;
    };

export function PricingTable(props: Props) {
  const [interval, setInterval] = useState<BillingInterval>("MONTH");
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);
  const redirect = ({ url }: { url: string }) => window.location.assign(url);
  const checkout = useAction(startCheckoutAction, { onSuccess: redirect });
  const portal = useAction(openBillingPortalAction, { onSuccess: redirect });

  return (
    <div className="grid gap-6">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-lg border bg-muted/50 p-1 text-sm">
          {(["MONTH", "YEAR"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition",
                interval === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "MONTH" ? "Monthly" : "Yearly"}
              {value === "YEAR" && <span className="ml-1.5 text-xs text-success">2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const price = interval === "MONTH" ? plan.price.monthly : Math.round(plan.price.yearly / 12);
          const isCurrent = props.mode === "billing" && props.currentPlan === id;

          let cta: ReactNode;
          if (props.mode === "marketing") {
            cta = (
              <Button asChild variant={plan.highlighted ? "default" : "outline"} className="w-full">
                <Link href="/sign-up">{id === "FREE" ? "Get started" : `Start ${plan.trialDays}-day trial`}</Link>
              </Button>
            );
          } else if (isCurrent) {
            cta = (
              <Button variant="outline" className="w-full" disabled>
                Current plan
              </Button>
            );
          } else if (id === "FREE") {
            cta = props.hasSubscription ? (
              <Button variant="outline" className="w-full" disabled={!props.canManage || !props.billingEnabled} loading={portal.pending} onClick={() => portal.execute(props.slug)}>
                Downgrade
              </Button>
            ) : null;
          } else if (props.hasSubscription) {
            cta = (
              <Button variant="outline" className="w-full" disabled={!props.canManage || !props.billingEnabled} loading={portal.pending} onClick={() => portal.execute(props.slug)}>
                Switch plan
              </Button>
            );
          } else {
            cta = (
              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                disabled={!props.canManage || !props.billingEnabled}
                loading={checkout.pending && pendingPlan === id}
                onClick={() => {
                  setPendingPlan(id);
                  checkout.execute(props.slug, { plan: id, interval });
                }}
              >
                Upgrade to {plan.name}
              </Button>
            );
          }

          return (
            <div
              key={id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-card p-6 shadow-xs",
                plan.highlighted && "border-primary/50 shadow-md ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{plan.name}</h3>
                {isCurrent ? <Badge variant="success">Current</Badge> : plan.highlighted ? <Badge>Most popular</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">${price}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </p>
              <p className="mt-1 h-4 text-xs text-muted-foreground">
                {interval === "YEAR" && plan.price.yearly > 0 ? `Billed $${plan.price.yearly} yearly` : ""}
              </p>
              <ul className="mt-5 grid flex-1 gap-2.5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              {cta && <div className="mt-6">{cta}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
