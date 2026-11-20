"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/config/demo";
import { env } from "@/config/env";
import { auth } from "@/infrastructure/auth";

/** One-click sign-in to the shared, read-only demo workspace. */
export async function signInAsDemoAction(): Promise<void> {
  if (!env.DEMO_MODE) redirect("/sign-in");
  await auth.api.signInEmail({ body: { email: DEMO.ownerEmail, password: DEMO.password }, headers: await headers() });
  redirect(`/o/${DEMO.homeSlug}`);
}
