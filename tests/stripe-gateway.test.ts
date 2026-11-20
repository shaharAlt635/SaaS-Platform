/**
 * The Stripe adapter: signature verification, event filtering and normalisation.
 * Stripe's API is stubbed; signatures are generated with Stripe's own test helper.
 */
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { StripeBillingGateway } from "@/infrastructure/billing/stripe-gateway";

const WEBHOOK_SECRET = "whsec_test_secret";
const PRICES = {
  PRO: { MONTH: "price_pro_m", YEAR: "price_pro_y" },
  BUSINESS: { MONTH: "price_biz_m", YEAR: undefined },
};

function gateway(subscription?: Partial<Stripe.Subscription>) {
  const instance = new StripeBillingGateway("sk_test_dummy", WEBHOOK_SECRET, PRICES);
  const retrieve = vi.fn().mockResolvedValue({
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    metadata: { organizationId: "org_1" },
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    items: { data: [{ price: { id: "price_pro_m" }, current_period_start: 1_780_000_000, current_period_end: 1_782_592_000 }] },
    ...subscription,
  });
  // Replace the network call; everything else is the real SDK.
  (instance as unknown as { stripe: Stripe }).stripe.subscriptions.retrieve = retrieve as never;
  return { instance, retrieve };
}

function signed(event: object) {
  const payload = JSON.stringify(event);
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) };
}

const subscriptionEvent = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_123", object: "subscription" } } };

describe("StripeBillingGateway", () => {
  it("verifies the signature and normalises the latest subscription state", async () => {
    const { instance, retrieve } = gateway();
    const { payload, signature } = signed(subscriptionEvent);
    const event = await instance.parseWebhook(payload, signature);

    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(event).toEqual({
      id: "evt_1",
      type: "customer.subscription.updated",
      subscription: {
        id: "sub_123",
        customerId: "cus_123",
        organizationId: "org_1",
        priceId: "price_pro_m",
        status: "ACTIVE",
        currentPeriodStart: new Date(1_780_000_000_000),
        currentPeriodEnd: new Date(1_782_592_000_000),
        cancelAtPeriodEnd: false,
        trialEnd: null,
      },
    });
  });

  it("rejects tampered payloads and foreign signatures", async () => {
    const { instance } = gateway();
    const { payload, signature } = signed(subscriptionEvent);
    await expect(instance.parseWebhook(payload.replace("sub_123", "sub_999"), signature)).rejects.toThrow(/signature/i);
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    await expect(instance.parseWebhook(payload, forged)).rejects.toThrow(/signature/i);
  });

  it("resolves the subscription from completed checkouts and ignores unrelated events", async () => {
    const { instance, retrieve } = gateway();
    const checkout = signed({ id: "evt_2", type: "checkout.session.completed", data: { object: { object: "checkout.session", subscription: "sub_123" } } });
    expect((await instance.parseWebhook(checkout.payload, checkout.signature))?.subscription.id).toBe("sub_123");

    const invoice = signed({ id: "evt_3", type: "invoice.paid", data: { object: { object: "invoice" } } });
    expect(await instance.parseWebhook(invoice.payload, invoice.signature)).toBeNull();
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("treats a scheduled cancellation as cancel-at-period-end and maps unknown statuses safely", async () => {
    const { instance } = gateway({ cancel_at: 1_790_000_000, status: "some_future_status" as Stripe.Subscription.Status });
    const { payload, signature } = signed(subscriptionEvent);
    const event = await instance.parseWebhook(payload, signature);
    expect(event?.subscription.cancelAtPeriodEnd).toBe(true);
    expect(event?.subscription.status).toBe("INCOMPLETE");
  });

  it("maps prices to plans in both directions", () => {
    const { instance } = gateway();
    expect(instance.priceFor("PRO", "YEAR")).toBe("price_pro_y");
    expect(instance.priceFor("BUSINESS", "YEAR")).toBeNull();
    expect(instance.resolvePrice("price_biz_m")).toEqual({ plan: "BUSINESS", interval: "MONTH" });
    expect(instance.resolvePrice("price_unknown")).toBeNull();
  });
});
