import "server-only";
import type { Dependencies } from "@/application/ports";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { DisabledBillingGateway, StripeBillingGateway } from "./billing/stripe-gateway";
import { db } from "./db";
import { createLogger } from "./logger";
import { ConsoleMailer, ResendMailer } from "./mail";
import { PrismaAnalyticsRepository } from "./repositories/analytics";
import { PrismaApiKeyRepository } from "./repositories/api-keys";
import { PrismaAuditLogRepository } from "./repositories/audit-logs";
import { PrismaBillingEventRepository, PrismaSubscriptionRepository } from "./repositories/billing";
import { PrismaInvitationRepository } from "./repositories/invitations";
import { PrismaMembershipRepository } from "./repositories/memberships";
import { PrismaOrganizationRepository } from "./repositories/organizations";

/**
 * Composition root: the only place that knows which concrete adapter backs each port.
 */
const logger = createLogger(env.NODE_ENV === "production");

const billing = env.STRIPE_SECRET_KEY
  ? new StripeBillingGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, {
      PRO: { MONTH: env.STRIPE_PRICE_PRO_MONTHLY, YEAR: env.STRIPE_PRICE_PRO_YEARLY },
      BUSINESS: { MONTH: env.STRIPE_PRICE_BUSINESS_MONTHLY, YEAR: env.STRIPE_PRICE_BUSINESS_YEARLY },
    })
  : new DisabledBillingGateway();

export const container: Dependencies = {
  organizations: new PrismaOrganizationRepository(db),
  memberships: new PrismaMembershipRepository(db),
  invitations: new PrismaInvitationRepository(db),
  subscriptions: new PrismaSubscriptionRepository(db),
  billingEvents: new PrismaBillingEventRepository(db),
  apiKeys: new PrismaApiKeyRepository(db),
  analytics: new PrismaAnalyticsRepository(db),
  auditLogs: new PrismaAuditLogRepository(db),
  billing,
  mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new ConsoleMailer(logger),
  logger,
  config: { appName: site.name, appUrl: env.APP_URL },
  clock: () => new Date(),
};
