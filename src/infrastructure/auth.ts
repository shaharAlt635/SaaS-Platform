import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { actionLinkEmail } from "@/application/emails";
import { isDemoEmail } from "@/config/demo";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { container } from "./container";
import { db } from "./db";

const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
};

export type SocialProvider = "github" | "google";
export const enabledSocialProviders = Object.keys(socialProviders) as SocialProvider[];

/** Fire-and-forget so response timing doesn't reveal whether an account exists. */
function sendInBackground(to: string, content: ReturnType<typeof actionLinkEmail>) {
  container.mailer.send({ to, ...content }).catch((error: unknown) => {
    container.logger.error("Failed to send auth email", { to, error: String(error) });
  });
}

/** Account-changing endpoints that would let one visitor lock others out of the shared demo. */
const DEMO_PROTECTED_PATHS = new Set([
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/set-password",
  "/link-social",
  "/unlink-account",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

const demoGuard = createAuthMiddleware(async (ctx) => {
  if (!env.DEMO_MODE) return;
  const forbidden = () => new APIError("FORBIDDEN", { message: "Demo accounts can't be changed. Create your own account to try this." });
  const bodyEmail = typeof ctx.body?.email === "string" ? ctx.body.email : "";
  if ((ctx.path === "/sign-up/email" || ctx.path === "/request-password-reset") && isDemoEmail(bodyEmail)) throw forbidden();
  if (DEMO_PROTECTED_PATHS.has(ctx.path)) {
    const session = await getSessionFromCtx(ctx);
    if (session && isDemoEmail(session.user.email)) throw forbidden();
  }
});

export const auth = betterAuth({
  appName: site.name,
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Preview deployments get their own *.vercel.app URL.
  trustedOrigins: [env.APP_URL, ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])],
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(
        user.email,
        actionLinkEmail({
          appName: site.name,
          subject: `Reset your ${site.name} password`,
          intro: "We received a request to reset your password. This link expires in 1 hour.",
          cta: "Reset password",
          url,
        }),
      );
    },
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(
        user.email,
        actionLinkEmail({
          appName: site.name,
          subject: `Verify your email for ${site.name}`,
          intro: "Confirm your email address to finish setting up your account.",
          cta: "Verify email",
          url,
        }),
      );
    },
  },
  socialProviders,
  account: {
    accountLinking: { enabled: true, trustedProviders: ["github", "google"] },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Cookie caching would let revoked sessions live on for its maxAge; validate against the DB instead.
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
    },
  },
  hooks: { before: demoGuard },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
