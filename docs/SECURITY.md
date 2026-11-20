# Security model

This document covers what the app protects, how, and where each control is tested. Tests are linked so every claim can be checked.

## Assets and threats

| Asset | Threat | Primary controls |
| --- | --- | --- |
| Tenant data (events, members, keys, audit log) | A user of org A reads or changes org B's data | Every query is scoped to the resolved organization; non-members get 404; IDs from other tenants resolve to "not found" |
| Elevated roles | A member grants themselves or others more power | Central permission matrix; grant ≤ own rank; admins can't manage admins or owners; can't change own role |
| Organization ownership | The last owner is removed or demoted, orphaning billing | Last-owner check on demote, remove and leave |
| Accounts | Credential stuffing, session theft, account takeover | Better Auth (scrypt hashes), auth rate limits, DB-validated sessions, httpOnly cookies, password reset revokes sessions |
| API keys | Leaked database exposes usable keys | Keys stored as SHA-256 hashes, shown once, revocable, prefix-only display |
| Invitations | Invite link forwarded or guessed | 256-bit random token, stored hashed, 7-day expiry, must match the invited email |
| Billing state | Forged or replayed Stripe webhooks | Signature verification on the raw body, processed-event table, state re-fetched from Stripe |
| Ingestion API | Abuse, oversized payloads, quota bypass | Per-key rate limit, 256 KB body cap, 100 events/request, monthly plan quota |
| Public demo | Visitors vandalise the shared workspace or lock others out | Read-only demo orgs enforced in use cases; demo accounts immutable at the auth layer; nightly reset |

## Authentication

- **Library:** [Better Auth](https://better-auth.com) with the Prisma adapter ([src/infrastructure/auth.ts](../src/infrastructure/auth.ts)). Passwords are hashed with scrypt; OAuth providers switch on when their credentials are set.
- **Sessions** are opaque tokens in an httpOnly, `SameSite=Lax` cookie (`Secure` over HTTPS), stored in Postgres and **validated against the database on every request**. The optional cookie cache is deliberately off so that sign-out-everywhere, password changes and deleted users take effect immediately (this was found in testing: with the cache on, a deleted session stayed valid for up to 5 minutes).
- **CSRF:** Better Auth rejects state-changing requests from origins other than `APP_URL` (and the Vercel preview URL). Next.js server actions additionally compare `Origin` with `Host`.
- **Rate limits** on sign-in (10/min), sign-up (5/min) and password reset (5 per 5 min) in production.
- **Enumeration:** password-reset requests always report success, and auth emails are sent in the background so response time doesn't reveal whether an account exists.
- **Open redirects:** `callbackUrl` is accepted only as a same-origin relative path ([`safeRedirect`](../src/lib/utils.ts)).
- **Email verification** is available (`REQUIRE_EMAIL_VERIFICATION=true`) once an email provider is configured.

The [proxy](../src/proxy.ts) (Next.js middleware) only checks that a session cookie *exists* to redirect early; it is never relied on for authorization.

## Authorization

### One policy, enforced in the use case

Permissions live in a single matrix in [src/domain/rbac.ts](../src/domain/rbac.ts):

| Permission | Owner | Admin | Member | Viewer |
| --- | :-: | :-: | :-: | :-: |
| `organization:read`, `members:read`, `analytics:read` | ✓ | ✓ | ✓ | ✓ |
| `api_keys:read` | ✓ | ✓ | ✓ | |
| `organization:update`, `members:invite` / `update` / `remove`, `api_keys:manage`, `billing:read`, `audit_log:read` | ✓ | ✓ | | |
| `organization:delete`, `billing:manage` | ✓ | | | |

Every use case calls `authorize(ctx, permission)` before doing anything else. Pages and buttons also check permissions, but only to hide what you can't use — the server never trusts the UI. Hidden pages opened by URL render an explicit "no access" state.

Rules beyond the matrix, all in the application layer ([members.ts](../src/application/use-cases/members.ts), [invitations.ts](../src/application/use-cases/invitations.ts)):

- You can grant or invite roles only up to your own rank.
- You can change or remove members ranked strictly below you (owners may also manage other owners).
- Nobody changes their own role; anyone may leave.
- An organization always keeps at least one owner.
- Plan entitlements (seats, keys, history, audit log) are checked server-side too.

### Tenant isolation

- The organization comes from the URL slug and is resolved together with the caller's membership. **Non-members get a 404**, not a 403, so organization existence isn't revealed.
- Anything addressed by ID (membership, invitation, API key) is loaded and checked against the caller's organization; another tenant's ID behaves exactly like a nonexistent one.
- Ingested events take their organization from the API key, never from the payload.
- Every tenant table has an `organizationId` foreign key with `ON DELETE CASCADE`.

### How it's tested

| What | Where |
| --- | --- |
| **Every protected use case × every role** must match the matrix exactly (68 cases), and the test fails if a permission exists that no case exercises | [tests/authorization.test.ts](../tests/authorization.test.ts) |
| Owner of org A, acting on org B's members, invitations and keys by ID → `NotFound`, nothing changes | [tests/authorization.test.ts](../tests/authorization.test.ts) |
| Read-only demo orgs block every mutation, even for the owner | [tests/authorization.test.ts](../tests/authorization.test.ts) |
| Escalation, last-owner and self-role rules | [tests/use-cases.test.ts](../tests/use-cases.test.ts) |
| Analytics SQL never returns another tenant's rows; cascades remove all tenant data | [tests/integration/repositories.test.ts](../tests/integration/repositories.test.ts) |
| Viewer UI hides admin areas and direct URLs are refused; admins can't manage owners; outsiders get 404 | [e2e/authorization.spec.ts](../e2e/authorization.spec.ts), [e2e/journey.spec.ts](../e2e/journey.spec.ts) |
| Demo protections against the running app | [e2e/demo-mode.spec.ts](../e2e/demo-mode.spec.ts) |

## Secrets and tokens

| Secret | Generated with | Stored as | Shown |
| --- | --- | --- | --- |
| API key `ak_…` | 30 random bytes, base64url | SHA-256 + 9-char prefix | Once, at creation |
| Invitation token | 32 random bytes | SHA-256 | Only in the emailed link (and to the inviter once) |
| Session token | Better Auth | Postgres, httpOnly cookie | Never |
| Password | — | scrypt (Better Auth) | Never |

SHA-256 (rather than a slow hash) is appropriate for API keys and invitation tokens because they're high-entropy random values, not human-chosen passwords; it keeps lookups to a single indexed query. All environment variables are validated at startup with Zod ([src/config/env.ts](../src/config/env.ts)); the app refuses to start without `BETTER_AUTH_SECRET` (≥ 32 chars) or, in production with Stripe enabled, without `STRIPE_WEBHOOK_SECRET`.

## Payments

- The webhook verifies Stripe's signature over the **raw** request body; bad signatures get 400 (no retry), handler failures get 500 (Stripe retries).
- Processed event IDs are recorded so retries are no-ops; the handler re-fetches the subscription from Stripe, so out-of-order delivery converges to the true state.
- An event for an older, canceled subscription can't overwrite a newer active one.
- Unknown price IDs fail loudly (500) rather than silently granting or revoking a plan.
- Only owners can start checkout or open the customer portal; deleting an organization cancels its subscription first.

Tested in [tests/stripe-gateway.test.ts](../tests/stripe-gateway.test.ts) (real signatures via Stripe's test helper, tampered payloads, forged secrets) and [tests/use-cases.test.ts](../tests/use-cases.test.ts) (idempotency, stale events, unknown prices).

## Input handling and HTTP hardening

- All input to use cases is parsed with Zod schemas in the domain layer; failures become field-level errors.
- No string-built SQL: Prisma queries and tagged-template `$queryRaw` (parameterized).
- React escapes output; the only `dangerouslySetInnerHTML` is a static, first-party theme script. Emails escape every interpolated value.
- Headers on every response: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. `X-Powered-By` is removed.
- Errors shown to users never include stack traces; unexpected errors are logged server-side with a reference digest.

## Public demo protections

With `DEMO_MODE=true` (the live demo):

1. **Read-only workspaces.** `assertWritable()` runs in every mutating use case for the demo organizations — it doesn't depend on the role, so even the demo *owner* can't rename, delete, invite, change roles or start checkout. API keys stay creatable so visitors can try the ingestion API.
2. **Immutable demo accounts.** A Better Auth `before` hook rejects password/email/profile changes, account deletion, session revocation and linking for `@acme.test` accounts, and refuses sign-ups and password resets for that domain (so nobody can claim the pending demo invitation).
3. **Nightly reset.** `/api/cron/reset-demo` rebuilds the demo data. It requires `Authorization: Bearer $CRON_SECRET` (compared in constant time) and returns 404 when demo mode is off.

Visitors who want to try the write paths sign up and get their own organization.

## Known limitations

- Rate limiters (ingestion and auth) are in-memory per instance. On multiple instances or serverless, back them with Redis or the database.
- Monthly event quotas are checked, then incremented: concurrent requests can exceed the cap slightly. Use an atomic conditional increment for hard caps.
- No content security policy yet (Next.js inline scripts need nonces); the other headers above are in place.
- Seat limits check members plus pending invitations at invite time, not at acceptance.
- No two-factor authentication or SSO yet. Better Auth offers both as plugins.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
