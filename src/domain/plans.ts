import { PlanLimitError } from "./errors";

export const PLAN_IDS = ["FREE", "PRO", "BUSINESS"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, "FREE">;

export const BILLING_INTERVALS = ["MONTH", "YEAR"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** `null` means unlimited. Kept serialisable so plans can be passed to client components. */
export interface PlanLimits {
  members: number | null;
  eventsPerMonth: number | null;
  apiKeys: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  limits: PlanLimits;
  features: string[];
  trialDays: number;
  /** Feature entitlement: access to the organization audit log. */
  auditLog: boolean;
  highlighted?: boolean;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  FREE: {
    id: "FREE",
    name: "Free",
    description: "For side projects and early exploration.",
    limits: { members: 3, eventsPerMonth: 10_000, apiKeys: 2 },
    features: ["Up to 3 team members", "10k events / month", "7-day analytics history", "Community support"],
    trialDays: 0,
    auditLog: false,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "For growing teams that ship every week.",
    limits: { members: 15, eventsPerMonth: 1_000_000, apiKeys: 10 },
    features: ["Up to 15 team members", "1M events / month", "90-day analytics history", "Audit log", "Email support"],
    trialDays: 14,
    auditLog: true,
    highlighted: true,
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    description: "For organizations with advanced needs.",
    limits: { members: null, eventsPerMonth: 20_000_000, apiKeys: null },
    features: ["Unlimited team members", "20M events / month", "1-year analytics history", "Priority support", "SSO (coming soon)"],
    trialDays: 14,
    auditLog: true,
  },
};

export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan !== "FREE";
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/** Maximum analytics look-back window in days per plan. */
export const HISTORY_DAYS: Readonly<Record<PlanId, number>> = { FREE: 7, PRO: 90, BUSINESS: 365 };

export function remaining(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used);
}

export function assertWithinLimit(limit: number | null, used: number, adding: number, what: string): void {
  if (limit !== null && used + adding > limit) {
    throw new PlanLimitError(`Your plan allows ${limit.toLocaleString("en-US")} ${what}. Upgrade to add more.`);
  }
}
