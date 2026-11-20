/**
 * Builds the demo workspace: four users (one per role), a Pro organization with ~6 months
 * of realistic events, a Free organization, an API key, a pending invitation and audit history.
 *
 * Used by `prisma/seed.ts` locally and by the nightly reset cron on the public demo.
 * Deliberately free of `server-only` so the seed script can run it under plain Node.
 */
import { hashPassword } from "better-auth/crypto";
import { generateToken, hashToken } from "@/application/crypto";
import { API_KEY_PREFIX } from "@/application/use-cases/api-keys";
import { DEMO } from "@/config/demo";
import { billingPeriod } from "@/domain/billing";
import type { PrismaClient, Role } from "@/generated/prisma/client";

const DAY = 86_400_000;

// Deterministic PRNG so every reset produces the same-looking charts.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_WEIGHTS: Array<[string, number]> = [
  ["page_view", 48],
  ["feature_used", 20],
  ["report_exported", 8],
  ["signup", 7],
  ["login", 7],
  ["invite_sent", 5],
  ["purchase", 5],
];
const TOTAL_WEIGHT = EVENT_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
const PAGES = ["/", "/pricing", "/docs", "/dashboard", "/settings", "/blog"];

function generateEvents(random: () => number, organizationId: string, days: number, baseline: number, now: Date) {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const eventName = () => {
    let roll = random() * TOTAL_WEIGHT;
    for (const [name, weight] of EVENT_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) return name;
    }
    return "page_view";
  };

  const users = Array.from({ length: Math.round(baseline * 8) }, (_, i) => `user_${(i + 1).toString().padStart(5, "0")}`);
  const events = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    const growth = 1 + ((days - d) / days) * 0.6; // steady growth over the period
    const seasonality = weekday === 0 || weekday === 6 ? 0.55 : 1;
    const elapsed = d === 0 ? (now.getTime() - dayStart) / DAY : 1; // today is partial
    const count = Math.round(baseline * growth * seasonality * (0.85 + random() * 0.3) * elapsed);
    // The audience grows too: each day draws from a larger slice of the user pool.
    const audience = users.slice(0, Math.max(10, Math.round(users.length * (0.3 + (0.7 * (days - d)) / days))));
    const daily = Array.from({ length: Math.max(5, Math.round(count / 6)) }, () => pick(audience));
    for (let i = 0; i < count; i++) {
      const name = eventName();
      const occurredAt = new Date(dayStart + random() * DAY * elapsed);
      events.push({
        organizationId,
        name,
        distinctId: pick(daily),
        properties:
          name === "page_view"
            ? { path: pick(PAGES) }
            : name === "purchase"
              ? { amount: Math.round(10 + random() * 190), currency: "USD" }
              : undefined,
        occurredAt,
        createdAt: occurredAt, // as if each event had been sent in real time
      });
    }
  }
  return events;
}

export interface DemoSeedResult {
  apiKey: string;
  events: number;
}

/** Replaces the demo users and organizations. Safe to re-run; touches nothing else. */
export async function seedDemoData(db: PrismaClient, now = new Date()): Promise<DemoSeedResult> {
  const random = mulberry32(42);

  await db.organization.deleteMany({ where: { slug: { in: [...DEMO.organizationSlugs] } } });
  await db.user.deleteMany({ where: { email: { endsWith: `@${DEMO.emailDomain}` } } });

  const password = await hashPassword(DEMO.password);
  const people: Array<{ name: string; email: string; role: Role }> = [
    { name: "Alex Morgan", email: DEMO.ownerEmail, role: "OWNER" },
    { name: "Jordan Lee", email: `jordan@${DEMO.emailDomain}`, role: "ADMIN" },
    { name: "Sam Rivera", email: `sam@${DEMO.emailDomain}`, role: "MEMBER" },
    { name: "Riley Chen", email: `riley@${DEMO.emailDomain}`, role: "VIEWER" },
  ];

  const users = [];
  for (const person of people) {
    const user = await db.user.create({ data: { name: person.name, email: person.email, emailVerified: true } });
    await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password } });
    users.push({ ...user, role: person.role });
  }
  const owner = users[0]!;

  const acme = await db.organization.create({
    data: {
      name: "Acme Inc",
      slug: DEMO.homeSlug,
      memberships: { create: users.map((user) => ({ userId: user.id, role: user.role })) },
      subscription: {
        create: {
          plan: "PRO",
          status: "ACTIVE",
          interval: "MONTH",
          stripeSubscriptionId: "sub_seed_acme",
          stripePriceId: "price_seed_pro_monthly",
          currentPeriodStart: new Date(now.getTime() - 10 * DAY),
          currentPeriodEnd: new Date(now.getTime() + 20 * DAY),
        },
      },
    },
  });

  const side = await db.organization.create({
    data: { name: "Side Project", slug: "side-project", memberships: { create: { userId: owner.id, role: "OWNER" } } },
  });

  let total = 0;
  for (const [org, days, baseline] of [
    [acme, 185, 260],
    [side, 10, 18],
  ] as const) {
    const events = generateEvents(random, org.id, days, baseline, now);
    for (let i = 0; i < events.length; i += 5_000) {
      await db.event.createMany({ data: events.slice(i, i + 5_000) });
    }
    const period = billingPeriod(now);
    const monthly = events.filter((event) => billingPeriod(event.occurredAt) === period).length;
    await db.usageCounter.create({ data: { organizationId: org.id, metric: "events", period, value: monthly } });
    total += events.length;
  }

  const secret = `${API_KEY_PREFIX}${generateToken(30)}`;
  await db.apiKey.create({
    data: {
      organizationId: acme.id,
      name: "Production web app",
      prefix: secret.slice(0, API_KEY_PREFIX.length + 6),
      keyHash: hashToken(secret),
      createdById: owner.id,
      lastUsedAt: new Date(now.getTime() - 3 * 60_000),
    },
  });

  await db.invitation.create({
    data: {
      organizationId: acme.id,
      email: `taylor@${DEMO.emailDomain}`,
      role: "MEMBER",
      tokenHash: hashToken(generateToken()),
      invitedById: owner.id,
      expiresAt: new Date(now.getTime() + 6 * DAY),
    },
  });

  const activity: Array<[string, number, string | null, Record<string, string>]> = [
    ["organization.created", 60, owner.id, { name: "Acme Inc" }],
    ["member.joined", 58, users[1]!.id, { role: "ADMIN" }],
    ["billing.subscription_updated", 40, null, { plan: "PRO", status: "ACTIVE", previousPlan: "FREE" }],
    ["member.joined", 30, users[2]!.id, { role: "MEMBER" }],
    ["api_key.created", 21, owner.id, { name: "Production web app" }],
    ["member.joined", 12, users[3]!.id, { role: "VIEWER" }],
    ["member.role_changed", 5, owner.id, { from: "MEMBER", to: "ADMIN" }],
    ["member.invited", 1, owner.id, { email: `taylor@${DEMO.emailDomain}`, role: "MEMBER" }],
  ];
  await db.auditLog.createMany({
    data: activity.map(([action, daysAgo, actorId, metadata]) => ({
      organizationId: acme.id,
      action,
      actorId,
      metadata,
      createdAt: new Date(now.getTime() - daysAgo * DAY),
    })),
  });

  return { apiKey: secret, events: total };
}
