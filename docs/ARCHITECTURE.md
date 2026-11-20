# Architecture

This document explains how the system is put together and how a request moves through it. For *why* it's built this way, see [DECISIONS.md](DECISIONS.md); for the security model, see [SECURITY.md](SECURITY.md).

## System context

```mermaid
flowchart LR
    user([User's browser])
    client([Customer backend<br/>sending events])
    subgraph vercel [Vercel]
        app[Next.js 16 app<br/>RSC · server actions · route handlers]
        cron[[Vercel Cron<br/>nightly demo reset]]
    end
    db[(PostgreSQL<br/>Neon)]
    stripe[Stripe<br/>Checkout · Portal · Webhooks]
    resend[Resend<br/>transactional email]

    user -- HTTPS, session cookie --> app
    client -- "POST /api/v1/events<br/>Bearer ak_…" --> app
    cron -- "GET /api/cron/reset-demo<br/>Bearer CRON_SECRET" --> app
    app -- Prisma 7 + pg adapter --> db
    app -- checkout / portal sessions --> stripe
    stripe -- signed webhooks --> app
    app -- invitations, password resets --> resend
```

One deployable unit. Every external service is behind a port, so each is optional at runtime: without Stripe the app runs on the Free plan, and without Resend emails go to the server log.

## Layers and the dependency rule

```mermaid
flowchart TB
    subgraph presentation [Presentation · src/app, src/features, src/components, src/server]
        pages[Server components]
        actions[Server actions]
        routes[Route handlers]
    end
    subgraph infrastructure [Infrastructure · src/infrastructure]
        repos[Prisma repositories]
        gateway[StripeBillingGateway]
        mailer[ResendMailer]
        authcfg[Better Auth config]
        container{{container.ts<br/>composition root}}
    end
    subgraph application [Application · src/application]
        usecases[Use cases]
        ports[/Ports: repository, billing,<br/>mailer, logger interfaces/]
    end
    subgraph domain [Domain · src/domain]
        rbac[RBAC policy]
        plans[Plans & limits]
        validation[Zod schemas]
        errors[Typed errors]
    end

    presentation --> application
    presentation --> container
    infrastructure -. implements .-> ports
    application --> domain
    infrastructure --> domain
    usecases --> ports
```

Arrows point at what a layer is allowed to import. The inner two layers never import Next.js, React, Prisma, Stripe or Better Auth — [eslint.config.mjs](../eslint.config.mjs) fails the lint step if they do.

| Layer | Knows about | Example |
| --- | --- | --- |
| Domain | Nothing but TypeScript and Zod | `canManageMember("ADMIN", "OWNER") === false` |
| Application | Domain + its own port interfaces | `inviteMember(deps, ctx, input)` authorizes, validates, checks seat limits, emails |
| Infrastructure | Everything above + vendors | `PrismaInvitationRepository.accept()` runs a transaction |
| Presentation | Everything | `inviteMemberAction` resolves the session and org, calls the use case, revalidates |

Use cases declare exactly what they need — `deps: Pick<Dependencies, "memberships" | "invitations" | …>` — so tests pass in-memory fakes and the signature documents the side effects.

## Anatomy of a mutation

Every write from the UI goes through the same pipeline. Example: an admin changes a member's role.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Members table (client)
    participant SA as changeMemberRoleAction
    participant RA as runAction()
    participant CTX as getOrgContext(slug)
    participant UC as changeMemberRole()
    participant REPO as MembershipRepository
    participant DB as Postgres

    UI->>SA: (slug, membershipId, role)
    SA->>RA: wrap
    RA->>CTX: session cookie → user
    CTX->>DB: org by slug + caller's membership
    alt not a member
        CTX-->>UI: 404 (existence not revealed)
    end
    RA->>UC: ctx, input
    UC->>UC: authorize(ctx, "members:update")
    UC->>UC: assertWritable (demo org?)
    UC->>UC: Zod-validate input
    UC->>REPO: findById(membershipId)
    UC->>UC: same tenant? manageable? assignable role? not last owner?
    UC->>REPO: updateRole()
    REPO->>DB: UPDATE memberships
    UC->>REPO: audit("member.role_changed")
    RA-->>UI: { ok: true } or { ok: false, error, fieldErrors }
```

`runAction` turns domain errors (`ForbiddenError`, `PlanLimitError`, `ValidationError`, …) into typed results the UI can show, and masks anything unexpected as a generic message while logging the details.

Reads take the same path without the action wrapper: server components call `getOrgContext(slug)` (memoized per request with React `cache`) and then a query use case.

## Event ingestion

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer backend
    participant R as POST /api/v1/events
    participant K as authenticateApiKey()
    participant L as Rate limiter
    participant I as ingestEvents()
    participant DB as Postgres

    C->>R: Bearer ak_… + JSON
    R->>K: SHA-256(key) lookup, active only
    K-->>R: ApiKey (org scope) or 401
    R->>L: 600 req/min per key
    L-->>R: allowed or 429 + Retry-After
    R->>I: payload
    I->>I: Zod: 1–100 events, names, ≤32 props
    I->>DB: usage for current month
    I->>I: plan quota check → 429 quota_exceeded
    I->>DB: one transaction: INSERT events + UPSERT usage_counters (+n)
    R-->>C: 202 { accepted: n }
```

The organization comes from the key, never from the payload, so a key can only ever write to its own tenant.

## Billing sync

```mermaid
sequenceDiagram
    autonumber
    participant U as Owner
    participant APP as App
    participant S as Stripe
    participant W as /api/webhooks/stripe

    U->>APP: Upgrade to Pro (monthly)
    APP->>S: create customer (idempotency key = org id)
    APP->>S: create Checkout session (metadata.organizationId, trial)
    APP-->>U: redirect to Checkout
    U->>S: pays
    S->>W: checkout.session.completed / customer.subscription.*
    W->>W: verify signature (raw body)
    W->>W: already processed event id? → 200 "duplicate"
    W->>S: retrieve latest subscription
    W->>W: price → plan, ignore stale events from an older subscription
    W->>APP: upsert subscription, audit, mark event processed
```

Entitlements are derived, not stored: `effectivePlan(subscription)` returns the paid plan while the status is `ACTIVE`, `TRIALING` or `PAST_DUE`, and `FREE` otherwise.

## Data model

```mermaid
erDiagram
    users ||--o{ memberships : has
    users ||--o{ sessions : has
    users ||--o{ accounts : "has (password / OAuth)"
    organizations ||--o{ memberships : has
    organizations ||--o{ invitations : has
    organizations ||--o| subscriptions : has
    organizations ||--o{ api_keys : has
    organizations ||--o{ events : has
    organizations ||--o{ usage_counters : has
    organizations ||--o{ audit_logs : has

    memberships {
        string organizationId
        string userId
        Role role "OWNER | ADMIN | MEMBER | VIEWER"
    }
    invitations {
        string email
        Role role
        string tokenHash "SHA-256, unique"
        datetime expiresAt
    }
    subscriptions {
        Plan plan
        SubscriptionStatus status
        string stripeSubscriptionId
        datetime currentPeriodEnd
    }
    api_keys {
        string prefix "shown in UI"
        string keyHash "SHA-256, unique"
        datetime revokedAt
    }
    events {
        string name
        string distinctId
        json properties
        datetime occurredAt
    }
    usage_counters {
        string metric "events"
        string period "YYYY-MM"
        int value
    }
```

Every tenant-owned row carries `organizationId` with `ON DELETE CASCADE`, and the hot paths are indexed (`events(organizationId, occurredAt)`, `events(organizationId, name, occurredAt)`, `audit_logs(organizationId, createdAt)`). Users are global: one account can belong to many organizations with a different role in each. `billing_events` stores processed Stripe event IDs for idempotency.

## Source map

| Path | Contents |
| --- | --- |
| [src/domain](../src/domain) | `rbac.ts`, `plans.ts`, `billing.ts`, `analytics.ts`, `validation.ts`, `errors.ts`, `entities.ts` |
| [src/application](../src/application) | `ports.ts`, `context.ts` (authorize, read-only guard, org resolution), `use-cases/*` |
| [src/infrastructure](../src/infrastructure) | `repositories/*`, `billing/stripe-gateway.ts`, `auth.ts`, `mail.ts`, `rate-limit.ts`, `container.ts`, `demo-data.ts` |
| [src/server](../src/server) | Request-scoped session/org context and the action runner |
| [src/features](../src/features) | Feature UI and server actions |
| [src/app](../src/app) | Routes, layouts, API route handlers |
| [tests](../tests), [e2e](../e2e) | Unit, integration and end-to-end tests |
