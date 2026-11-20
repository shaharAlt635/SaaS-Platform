import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { container } from "@/infrastructure/container";
import { db } from "@/infrastructure/db";
import { seedDemoData } from "@/infrastructure/demo-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Rebuilds the public demo workspace. Triggered nightly by Vercel Cron (see vercel.json). */
export async function GET(request: Request) {
  if (!env.DEMO_MODE || !env.CRON_SECRET) return Response.json({ error: "Not found" }, { status: 404 });
  if (!authorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { events } = await seedDemoData(db);
  container.logger.info("Demo workspace reset", { events });
  return Response.json({ ok: true, events });
}
