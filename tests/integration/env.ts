import "dotenv/config";

// Point the app's own infrastructure (env, db, container) at the disposable test database.
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://unused:unused@localhost:1/unused";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.DEMO_MODE = "false";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.RESEND_API_KEY;
