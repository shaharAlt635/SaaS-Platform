"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { DEMO } from "@/config/demo";
import { env } from "@/config/env";
import { auth } from "@/infrastructure/auth";
import { container } from "@/infrastructure/container";

/** One-click sign-in to the shared, read-only demo workspace. */
export async function signInAsDemoAction(): Promise<void> {
  if (!env.DEMO_MODE) redirect("/sign-in");
  try {
    await auth.api.signInEmail({ body: { email: DEMO.ownerEmail, password: DEMO.password }, headers: await headers() });
  } catch (error) {
    unstable_rethrow(error);
    // Most likely the demo data is missing or mid-reset.
    container.logger.error("Demo sign-in failed", { error: String(error) });
    redirect("/sign-in?demo=unavailable");
  }
  redirect(`/o/${DEMO.homeSlug}`);
}
