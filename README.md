# SaaS Platform

A production-ready, multi-tenant SaaS dashboard: authentication, organizations, role-based permissions, Stripe subscription billing, product analytics with an ingestion API, and an audit log — built with **Next.js 16, TypeScript, PostgreSQL and Prisma 7**, following clean architecture.

## Features

| Area | What you get |
| --- | --- |
| **Authentication** | Email + password, optional GitHub/Google OAuth, password reset, optional email verification, DB-backed sessions, auth rate limiting ([Better Auth](https://better-auth.com)) |
| **Organizations** | Multi-tenant workspaces, org switcher, onboarding, slug-based URLs, invitations by email (hashed, expiring tokens), leave / delete org |
| **RBAC** | Owner / Admin / Member / Viewer with a central permission matrix, anti-escalation rules and last-owner protection |
| **Billing** | Stripe Checkout + Customer Portal, free trials, plan limits (seats, events/month, API keys), feature gating, idempotent webhooks |
| **Analytics** | `POST /api/v1/events` ingestion with hashed API keys, per-key rate limiting and monthly quotas; dashboards for volume, unique users, engagement and top events with period-over-period deltas |
| **Audit log** | Every sensitive change (members, roles, keys, settings, billing) recorded and browsable (Pro+) |
| **UI** | Responsive layout with mobile drawer, dark mode, accessible components (Radix), toasts, skeletons, empty states |
| **Ops** | Env validation, security headers, health check, structured logs, Dockerfile, CI workflow, seed data |

## Architecture

The code follows the **dependency rule**: inner layers never import outer ones. ESLint enforces it (`no-restricted-imports` in [eslint.config.mjs](eslint.config.mjs)).

```
┌──────────────────────────────────────────────────────────────────┐
│ Presentation   src/app, src/features, src/components, src/server │  Next.js routes, server actions, React UI
├──────────────────────────────────────────────────────────────────┤
│ Infrastructure src/infrastructure                                │  Prisma repositories, Stripe, Resend, Better Auth
├──────────────────────────────────────────────────────────────────┤
│ Application    src/application                                   │  Use cases + ports (interfaces)
├──────────────────────────────────────────────────────────────────┤
│ Domain         src/domain                                        │  Entities, RBAC policy, plans, validation, errors
└──────────────────────────────────────────────────────────────────┘
```

- **Domain** (`src/domain`) — pure TypeScript: the permission matrix, plan limits, billing rules, analytics math, Zod input schemas and typed domain errors. No framework imports.
- **Application** (`src/application`) — one function per use case (`inviteMember`, `startCheckout`, `handleBillingWebhook`, …). Each takes its dependencies explicitly (`Pick<Dependencies, …>`), authorizes the actor, validates input and talks only to **ports** ([ports.ts](src/application/ports.ts)).
- **Infrastructure** (`src/infrastructure`) — adapters implementing the ports: Prisma repositories, `StripeBillingGateway`, `ResendMailer`, Better Auth config. [container.ts](src/infrastructure/container.ts) is the composition root.
- **Presentation** — server components call use cases directly; mutations go through server actions wrapped by [`runAction`](src/server/action.ts), which maps domain errors to typed `ActionResult`s. Feature UI lives in `src/features/<feature>`.

Because use cases only see ports, they're unit-tested against in-memory fakes ([tests/fakes.ts](tests/fakes.ts)) — no database needed.

### Project layout

```
prisma/                 schema, migrations, seed
src/
  app/                  routes: (marketing), (auth), onboarding, invite, account, o/[slug]/*, api/*
  application/          use cases, ports, auth context, emails
  components/           UI primitives (ui/), app shell, charts
  config/               validated env, site constants
  domain/               entities, rbac, plans, billing, analytics, validation, errors
  features/             feature UI + server actions (members, billing, api-keys, …)
  infrastructure/       prisma repositories, stripe, mail, auth, rate limiter, container
  server/               request-scoped session/org context, action runner
  proxy.ts              optimistic auth gate (Next.js 16 "proxy", formerly middleware)
tests/                  vitest unit tests
```

## Getting started

**Prerequisites:** Node.js ≥ 20.19 and PostgreSQL (Docker, a hosted database, or Prisma's local dev server).

```bash
npm install
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` (e.g. `openssl rand -base64 32`) and `DATABASE_URL`. For a database, pick one:

```bash
docker compose up -d                     # Postgres 17 on localhost:5432 (matches .env.example)
```

```bash
npx prisma dev                           # or: local Prisma Postgres, no Docker needed — copy the TCP URL it prints
```

Then migrate, seed and run:

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000. The seed creates a demo workspace with ~6 months of events:

| Email | Password | Role in "Acme Inc" |
| --- | --- | --- |
| `demo@acme.test` | `demo-password-123` | Owner (also owns "Side Project" on the Free plan) |
| `jordan@acme.test` | `demo-password-123` | Admin |
| `sam@acme.test` | `demo-password-123` | Member |
| `riley@acme.test` | `demo-password-123` | Viewer |

> These are local development fixtures. Don't run the seed against production.

Without `RESEND_API_KEY`, emails (invitations, password resets) are printed to the server console.

## Roles & permissions

Defined once in [src/domain/rbac.ts](src/domain/rbac.ts) and enforced in every use case.

| Permission | Owner | Admin | Member | Viewer |
| --- | :-: | :-: | :-: | :-: |
| View organization, members, analytics | ✓ | ✓ | ✓ | ✓ |
| View API keys | ✓ | ✓ | ✓ | |
| Edit settings, invite / manage members, manage API keys | ✓ | ✓ | | |
| View billing & audit log | ✓ | ✓ | | |
| Manage billing, delete organization | ✓ | | | |

Rules: you can only grant roles up to your own; admins can't manage other admins or owners; nobody changes their own role; an organization always keeps at least one owner. Non-members get a 404 for an organization (existence isn't leaked).

## Plans

Defined in [src/domain/plans.ts](src/domain/plans.ts) — prices shown in the UI, limits enforced in use cases.

| | Free | Pro | Business |
| --- | --- | --- | --- |
| Seats (members + pending invites) | 3 | 15 | Unlimited |
| Events / month | 10k | 1M | 20M |
| Active API keys | 2 | 10 | Unlimited |
| Analytics history | 7 days | 90 days | 1 year |
| Audit log | | ✓ | ✓ |
| Trial | | 14 days | 14 days |

## Billing (Stripe)

Billing is off until `STRIPE_SECRET_KEY` is set; the app runs fully on the Free plan without it.

1. In Stripe, create **Pro** and **Business** products, each with a monthly and a yearly recurring price. Put the four price IDs in `STRIPE_PRICE_*`.
2. Enable the [Customer Portal](https://dashboard.stripe.com/test/settings/billing/portal) (allow plan switching and cancellation).
3. Add a webhook endpoint `https://<your-domain>/api/webhooks/stripe` subscribed to `checkout.session.completed` and `customer.subscription.created|updated|deleted|paused|resumed`; set `STRIPE_WEBHOOK_SECRET`.

Locally, forward webhooks with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The webhook handler verifies signatures, re-fetches the latest subscription from Stripe (so out-of-order deliveries converge), records processed event IDs (so retries are no-ops), and ignores stale events from an older subscription.

## Events API

Create a key under **API keys**, then:

```bash
curl -X POST http://localhost:3000/api/v1/events -H "Authorization: Bearer ak_..." -H "Content-Type: application/json" -d '{"name":"signup","distinctId":"user_42","properties":{"plan":"pro"}}'
```

Send one event or `{"events": [...]}` with up to 100. Responses: `202` accepted, `400` invalid payload, `401` bad key, `413` body over 256 KB, `429` rate limit (600 req/min per key) or monthly quota reached. Keys are stored as SHA-256 hashes and shown once.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run check` | Lint + typecheck + tests |
| `npm test` | Unit tests (Vitest) |
| `npm run db:migrate` | Create & apply a migration in development |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse data in Prisma Studio |

## Deployment

- **Docker:** `docker build -t saas-platform .` produces a standalone Next.js image running as a non-root user. Env vars are validated at startup.
- **Migrations:** run `npx prisma migrate deploy` as a release step before new instances start.
- **Health check:** `GET /api/health` returns `503` when the database is unreachable.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, typecheck, tests, migrations against Postgres, and a production build.

### Production checklist

- Set `APP_URL` to your public HTTPS origin and a strong `BETTER_AUTH_SECRET`.
- Configure `RESEND_API_KEY` + `EMAIL_FROM` with a verified domain, then set `REQUIRE_EMAIL_VERIFICATION=true`.
- When running more than one instance, move the ingestion rate limiter ([rate-limit.ts](src/infrastructure/rate-limit.ts)) and Better Auth's rate-limit storage to Redis or the database.
- Use a pooled connection string (e.g. PgBouncer / Prisma Postgres) for serverless deployments.
- Event quotas are soft limits under heavy concurrency (checked, then incremented); move to an atomic conditional increment if you need hard caps.
