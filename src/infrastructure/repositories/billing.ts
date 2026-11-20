import type { BillingEventRepository, SubscriptionRepository, SubscriptionSnapshot } from "@/application/ports";
import type { Subscription } from "@/domain/billing";
import type { Database } from "../db";

type Row = Awaited<ReturnType<Database["subscription"]["findUnique"]>>;

function toSubscription(row: NonNullable<Row>): Subscription {
  if (row.plan === "FREE") throw new Error(`Subscription ${row.id} has invalid plan FREE`);
  return {
    id: row.id,
    organizationId: row.organizationId,
    plan: row.plan,
    status: row.status,
    interval: row.interval,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: row.stripePriceId,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    trialEndsAt: row.trialEndsAt,
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async findByOrganization(organizationId: string): Promise<Subscription | null> {
    const row = await this.db.subscription.findUnique({ where: { organizationId } });
    return row ? toSubscription(row) : null;
  }

  async upsert(organizationId: string, snapshot: SubscriptionSnapshot): Promise<Subscription> {
    const row = await this.db.subscription.upsert({
      where: { organizationId },
      create: { organizationId, ...snapshot },
      update: snapshot,
    });
    return toSubscription(row);
  }
}

export class PrismaBillingEventRepository implements BillingEventRepository {
  constructor(private readonly db: Database) {}

  async wasProcessed(id: string): Promise<boolean> {
    return (await this.db.billingEvent.count({ where: { id } })) > 0;
  }

  async markProcessed(id: string, type: string): Promise<void> {
    await this.db.billingEvent.upsert({ where: { id }, create: { id, type }, update: {} });
  }
}
