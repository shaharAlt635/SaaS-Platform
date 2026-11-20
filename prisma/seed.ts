/**
 * Seeds the demo workspace locally. Safe to re-run: it replaces only the demo records.
 * Demo logins: see src/config/demo.ts (public on purpose — never seed production with real users).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO } from "../src/config/demo";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDemoData } from "../src/infrastructure/demo-data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

seedDemoData(db)
  .then(({ apiKey, events }) => {
    console.log(`Seeded ${events.toLocaleString()} events.`);
    console.log(`Sign in with ${DEMO.ownerEmail} / ${DEMO.password}`);
    console.log(`Demo API key for "${DEMO.homeSlug}" (shown once): ${apiKey}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
