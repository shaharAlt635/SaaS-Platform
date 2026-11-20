import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the running app and the seeded demo data (`npm run db:seed`).
 * Uses Playwright's Chromium by default; set PW_CHANNEL=chrome to use an installed Chrome instead.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial by default: tests share the seeded demo data, and the local Prisma dev database is single-connection.
  workers: Number(process.env.E2E_WORKERS ?? 1),
  // Generous timeouts: the dev server compiles routes on first visit.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.PW_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL }, testIgnore: /responsive/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL }, testMatch: /responsive/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
