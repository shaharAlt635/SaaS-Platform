import { execSync } from "node:child_process";
import "dotenv/config";

/** Brings the test database up to the current migrations; tests truncate tables between cases. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("\n⚠  TEST_DATABASE_URL is not set — integration tests will be skipped.\n");
    return;
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: integration tests wipe the database.");
  }
  execSync("npx prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
}
