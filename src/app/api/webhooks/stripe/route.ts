import { handleBillingWebhook } from "@/application/use-cases/billing";
import { container } from "@/infrastructure/container";

export async function POST(request: Request) {
  if (!container.billing.enabled) {
    return Response.json({ error: "Billing is not configured" }, { status: 404 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  // The raw body is required for signature verification.
  const payload = await request.text();

  let outcome;
  try {
    outcome = await handleBillingWebhook(container, payload, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSignatureError = error instanceof Error && error.name === "StripeSignatureVerificationError";
    container.logger[isSignatureError ? "warn" : "error"]("Stripe webhook failed", { error: message });
    // 400 for bad signatures (don't retry); 500 otherwise so Stripe retries.
    return Response.json({ error: isSignatureError ? "Invalid signature" : "Webhook handler failed" }, { status: isSignatureError ? 400 : 500 });
  }
  return Response.json({ received: true, outcome });
}
