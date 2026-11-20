import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000").transform((url) => url.replace(/\/$/, "")),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Connections per server instance. Keep small on serverless; use 1 with `npx prisma dev`. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  /** Public demo: shows "Try the demo", makes the demo workspace read-only, enables the nightly reset. */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** Shared secret Vercel Cron sends as a Bearer token. */
  CRON_SECRET: optional,

  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Acme <noreply@example.com>"),

  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  STRIPE_PRICE_PRO_YEARLY: optional,
  STRIPE_PRICE_BUSINESS_MONTHLY: optional,
  STRIPE_PRICE_BUSINESS_YEARLY: optional,
});

export type Env = z.infer<typeof schema>;

/** On Vercel, fall back to the production domain when APP_URL isn't set explicitly. */
function withDefaults(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const vercelUrl = source.VERCEL_PROJECT_PRODUCTION_URL;
  return { ...source, APP_URL: source.APP_URL || (vercelUrl ? `https://${vercelUrl}` : undefined) };
}

function load(): Env {
  // Docker/CI builds run without secrets; values are validated when the server starts.
  if (process.env.SKIP_ENV_VALIDATION) {
    return schema.parse({ ...withDefaults(process.env), DATABASE_URL: process.env.DATABASE_URL || "postgres://build", BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "x".repeat(32) });
  }
  const result = schema.safeParse(withDefaults(process.env));
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  if (result.data.NODE_ENV === "production" && result.data.STRIPE_SECRET_KEY && !result.data.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required when billing is enabled in production.");
  }
  return result.data;
}

export const env = load();
