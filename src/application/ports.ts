/**
 * Ports: the interfaces the application layer needs from the outside world.
 * Infrastructure provides the implementations (Prisma, Stripe, Resend, …);
 * tests provide in-memory fakes.
 */
import type { Subscription, SubscriptionStatus } from "@/domain/billing";
import type {
  ApiKey,
  AuditLogEntry,
  Invitation,
  Member,
  Membership,
  Organization,
  StoredEvent,
  TrackedEvent,
} from "@/domain/entities";
import type { DailyPoint, Window } from "@/domain/analytics";
import type { BillingInterval, PaidPlanId } from "@/domain/plans";
import type { Role } from "@/domain/rbac";

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  findByStripeCustomerId(customerId: string): Promise<Organization | null>;
  slugExists(slug: string): Promise<boolean>;
  /** Atomically creates the organization and its first OWNER membership. */
  createWithOwner(data: { name: string; slug: string }, ownerUserId: string): Promise<Organization>;
  update(id: string, data: Partial<Pick<Organization, "name" | "slug" | "stripeCustomerId">>): Promise<Organization>;
  delete(id: string): Promise<void>;
  listForUser(userId: string): Promise<Array<Organization & { role: Role }>>;
}

export interface MembershipRepository {
  find(organizationId: string, userId: string): Promise<Membership | null>;
  findById(id: string): Promise<Membership | null>;
  list(organizationId: string): Promise<Member[]>;
  count(organizationId: string): Promise<number>;
  countByRole(organizationId: string, role: Role): Promise<number>;
  isMemberByEmail(organizationId: string, email: string): Promise<boolean>;
  updateRole(id: string, role: Role): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface InvitationWithOrganization extends Invitation {
  organization: Organization;
}

export interface InvitationRepository {
  /** Creates or refreshes the pending invitation for (organization, email). */
  upsert(data: {
    organizationId: string;
    email: string;
    role: Role;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
  }): Promise<Invitation>;
  findById(id: string): Promise<Invitation | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationWithOrganization | null>;
  listPending(organizationId: string, now: Date): Promise<Invitation[]>;
  countPending(organizationId: string, now: Date): Promise<number>;
  delete(id: string): Promise<void>;
  /** Atomically creates the membership and consumes the invitation. */
  accept(invitationId: string, userId: string): Promise<Membership>;
}

export type SubscriptionSnapshot = Omit<Subscription, "id" | "organizationId">;

export interface SubscriptionRepository {
  findByOrganization(organizationId: string): Promise<Subscription | null>;
  upsert(organizationId: string, snapshot: SubscriptionSnapshot): Promise<Subscription>;
}

export interface BillingEventRepository {
  wasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
}

export interface ApiKeyRepository {
  list(organizationId: string): Promise<ApiKey[]>;
  countActive(organizationId: string): Promise<number>;
  findById(id: string): Promise<ApiKey | null>;
  findActiveByHash(keyHash: string): Promise<ApiKey | null>;
  create(data: { organizationId: string; name: string; prefix: string; keyHash: string; createdById: string }): Promise<ApiKey>;
  revoke(id: string, at: Date): Promise<void>;
  touch(id: string, at: Date): Promise<void>;
}

export interface AnalyticsRepository {
  /** Inserts events and increments the period usage counter in one transaction. */
  ingest(organizationId: string, events: TrackedEvent[], period: string): Promise<void>;
  usage(organizationId: string, period: string): Promise<number>;
  totals(organizationId: string, window: Window): Promise<{ events: number; users: number }>;
  daily(organizationId: string, window: Window): Promise<DailyPoint[]>;
  topEvents(organizationId: string, window: Window, limit: number): Promise<Array<{ name: string; count: number }>>;
  /** Most recently received events first, cursor-paginated. */
  recent(
    organizationId: string,
    options: { since: Date; limit: number; cursor?: string; name?: string },
  ): Promise<{ items: StoredEvent[]; nextCursor: string | null }>;
  /** Distinct event names received since `since`, alphabetically. */
  eventNames(organizationId: string, since: Date): Promise<string[]>;
}

export interface AuditLogRepository {
  record(entry: {
    organizationId: string;
    actorId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  list(organizationId: string, options: { limit: number; cursor?: string }): Promise<{ items: AuditLogEntry[]; nextCursor: string | null }>;
}

export interface ProviderSubscription {
  id: string;
  customerId: string;
  organizationId: string | null;
  priceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  subscription: ProviderSubscription;
}

export interface BillingGateway {
  readonly enabled: boolean;
  priceFor(plan: PaidPlanId, interval: BillingInterval): string | null;
  resolvePrice(priceId: string): { plan: PaidPlanId; interval: BillingInterval } | null;
  createCustomer(input: { organizationId: string; name: string; email: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    organizationId: string;
    priceId: string;
    trialDays: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the signature and normalises relevant events. Returns null for events we ignore. */
  parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent | null>;
}

export interface Mailer {
  send(message: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AppConfig {
  appName: string;
  appUrl: string;
  /** Organizations that can be viewed but not modified (the shared public demo). */
  readOnlyOrganizationSlugs: readonly string[];
}

/** Everything a use case may depend on. Use cases declare the subset they need via `Pick`. */
export interface Dependencies {
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  subscriptions: SubscriptionRepository;
  billingEvents: BillingEventRepository;
  apiKeys: ApiKeyRepository;
  analytics: AnalyticsRepository;
  auditLogs: AuditLogRepository;
  billing: BillingGateway;
  mailer: Mailer;
  logger: Logger;
  config: AppConfig;
  clock: () => Date;
}
