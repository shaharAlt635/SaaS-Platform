# Technical decisions

Short records of the choices that shape this codebase: the context, what was chosen, and what it costs. Each one is a trade-off, not a rule.

---

## 1. Next.js App Router with server components and server actions

**Context.** A dashboard is mostly authenticated reads with a handful of mutations, and needs a public marketing page and a few HTTP APIs.

**Decision.** One Next.js 16 app. Pages are server components that call use cases directly; mutations are server actions; public APIs (event ingestion, Stripe webhooks, cron, health) are route handlers.

**Why.** No separate API layer to build, version and secure for the UI; data never leaves the server unless a component renders it; streaming with `loading.tsx` comes for free. The same use cases back both actions and route handlers, so behaviour doesn't drift between UI and API.

**Cost.** Server actions are tied to Next.js. That's contained: they're thin wrappers (resolve context → call use case → revalidate), so moving to another transport means rewriting about 15 short functions, not business logic.

## 2. Clean architecture, kept pragmatic

**Context.** SaaS logic (who may do what, plan limits, billing state) changes often and is costly to get wrong. It should be testable without a database or a browser.

**Decision.** Four layers — domain, application, infrastructure, presentation — with the dependency rule enforced by ESLint. Use cases are plain functions that take their dependencies as an argument typed `Pick<Dependencies, …>`. A single composition root (`container.ts`) wires the real adapters.

**Why.** The rules that matter most (RBAC, limits, webhook handling) run in milliseconds against in-memory fakes, which is what makes an exhaustive authorization matrix practical. Each use case's signature lists its side effects. Swapping Stripe, Resend or even Prisma touches only infrastructure.

**What I didn't do.** No DI framework, no classes for use cases, no separate DTO layer for every entity. Repository interfaces return plain domain types. Feature folders hold UI plus actions instead of mirroring all four layers per feature. The goal is the testability and boundaries, not ceremony.

## 3. Better Auth for authentication, own code for organizations and RBAC

**Context.** Authentication is commodity and security-critical; organizations, roles and plan-aware permissions are the product.

**Decision.** [Better Auth](https://better-auth.com) handles credentials, OAuth, sessions, password reset, email verification and auth rate limiting, using our Prisma models. Organizations, memberships, invitations and RBAC are implemented in the domain/application layers.

**Why.** Better Auth is self-hosted (no per-MAU pricing or vendor lock-in like Clerk/Auth0), TypeScript-first, and stores everything in our database. Its organization plugin exists, but owning that part means one permission matrix used everywhere, rules like "admins can't manage admins" and "last owner can't leave", plan-aware seat limits, read-only demo orgs and audit logging — all in plain, tested code.

**Cost.** We maintain invitation and membership flows ourselves (~300 lines plus tests).

## 4. Database sessions, validated on every request

**Decision.** Opaque session tokens checked against Postgres on each request; Better Auth's signed cookie cache is disabled.

**Why.** Revocation must be immediate: sign-out-everywhere, password changes and deleted accounts. Testing showed that with the cache enabled a deleted user's session kept working for up to five minutes. The lookup is one indexed query, deduplicated per request with React `cache`.

**Cost.** One extra query per request compared with stateless JWTs. If that ever matters, re-enable the cache with a short TTL, or move sessions to Redis.

## 5. Non-members get 404, not 403

**Decision.** Opening an organization you don't belong to — or a member, invite or key ID from another tenant — returns "not found".

**Why.** A 403 confirms that the organization or record exists. Treating foreign IDs as missing also means there's no separate code path to get wrong: lookups are always "find in *this* organization".

## 6. Prisma 7 with the `pg` driver adapter, plus raw SQL for analytics

**Decision.** Prisma for schema, migrations and CRUD. Analytics aggregations (`date_trunc` buckets, `count(DISTINCT …)`) use parameterized `$queryRaw`. A configurable pool size (`DATABASE_POOL_MAX`) keeps serverless functions from exhausting connections.

**Why.** Prisma gives typed queries and reviewable SQL migrations; Prisma 7's driver adapters remove the Rust engine binary and work well on serverless with a pooled Neon URL. The analytics queries are simpler and faster as SQL than as ORM calls, and because they're hand-written they get **integration tests on real Postgres** (UTC day boundaries, distinct users, half-open windows, tenant scoping).

## 7. Usage counters instead of counting events for quotas

**Decision.** A `usage_counters(organizationId, metric, period)` row is incremented in the same transaction that inserts events. Quota checks read one row.

**Why.** `COUNT(*)` over a month of events gets slower as customers grow; a counter is O(1) and also feeds the billing page.

**Cost.** Check-then-increment isn't atomic across concurrent requests, so the quota is a soft limit by up to one batch per concurrent request. Documented; a conditional `UPDATE … WHERE value + n <= limit` would make it hard.

## 8. API keys and invitation tokens hashed with SHA-256

**Decision.** Generate 30–32 random bytes; store only `sha256(token)`; show the key once with a short visible prefix.

**Why.** A database leak must not leak working credentials. Slow hashes (bcrypt/argon2) protect low-entropy passwords from guessing; for 240+ bits of randomness a fast hash is equally safe and allows a single indexed lookup per API request. The `ak_` prefix lets secret scanners and humans recognise keys.

## 9. Stripe: hosted Checkout and Portal, webhook as the source of truth

**Decision.** Use Stripe Checkout and the Customer Portal instead of building payment forms. The app never sets the plan from the redirect; only webhooks update subscriptions. The webhook handler is idempotent, re-fetches the latest subscription from Stripe, maps price IDs to plans, and ignores stale events from older subscriptions.

**Why.** No card data touches our servers (minimal PCI scope); upgrades, downgrades, proration, invoices and dunning come from Stripe. Webhooks can arrive late, twice or out of order — re-fetching and idempotency make that safe. Entitlements are computed (`effectivePlan`) from status, so `PAST_DUE` keeps access during Stripe's retry window and `CANCELED` drops to Free automatically.

**Cost.** Plan prices are defined in code for display and in Stripe for charging; the price-ID env vars connect the two.

## 10. Plans and permissions as code

**Decision.** Plan limits and the permission matrix are TypeScript constants, not database rows.

**Why.** They change with deployments anyway (new features need new code), they're type-checked, reviewable in pull requests, and usable in pure functions and tests. Per-customer overrides (enterprise deals) would justify moving limits to the database later.

## 11. Testing strategy

| Layer | Tool | Runs against | Purpose |
| --- | --- | --- | --- |
| Unit (112) | Vitest | In-memory fakes | Domain rules, use cases, the full authorization matrix, Stripe adapter |
| Integration (21) | Vitest | Real Postgres (`TEST_DATABASE_URL`) | Constraints, transactions, cascades, raw SQL, HTTP route handlers |
| End-to-end (7 + 2) | Playwright | Running app + seeded data | Critical journeys and RBAC as a user sees it; demo-mode smoke test |

The weight is deliberately on fast tests of business rules. The integration suite exists because some guarantees only the database can give (a transaction actually rolling back, `ON DELETE CASCADE`, UTC bucketing). E2E covers what neither can: that the UI, session cookies and server actions work together. Integration tests skip themselves when no test database is configured, and refuse to run against `DATABASE_URL`.

Testing surfaced real bugs that were fixed: sessions outliving deletion (decision 4), relative timestamps causing hydration mismatches, list use cases throwing synchronously instead of rejecting, and unclear validation messages from the batch ingestion schema.

## 12. A public, read-only demo instead of a video

**Decision.** `DEMO_MODE=true` adds a one-click "Explore the live demo" sign-in, makes the seeded organizations read-only in the application layer, freezes the demo accounts at the auth layer, and rebuilds the data nightly via Vercel Cron.

**Why.** Reviewers can click through real data in seconds without signing up, and nobody can break it for the next visitor. Enforcing read-only in use cases (not just hiding buttons) means the demo itself demonstrates the authorization model. Anyone who wants to try mutations can sign up and get their own organization.

## 13. Deployment: Vercel + Neon

**Decision.** Vercel for the app and cron; Neon serverless Postgres (pooled URL at runtime, direct URL for migrations); migrations run in the Vercel build (`prisma migrate deploy && next build`). A Dockerfile with standalone output is kept for self-hosting.

**Why.** Zero-ops, free tiers, preview deployments, and first-class Next.js support. Running migrations during the build keeps schema and code in lockstep; migrations are additive, so the old version keeps working until traffic switches.

**Cost.** In-memory rate limiting is per serverless instance (see [SECURITY.md](SECURITY.md#known-limitations)).
