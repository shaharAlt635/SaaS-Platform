import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { enabledSocialProviders } from "@/infrastructure/auth";
import { safeRedirect } from "@/lib/utils";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const callbackURL = safeRedirect((await searchParams).callbackUrl);
  if (await getSession()) redirect(callbackURL);

  return (
    <>
      <SignUpForm providers={enabledSocialProviders} callbackURL={callbackURL} requireVerification={env.REQUIRE_EMAIL_VERIFICATION} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/sign-in?callbackUrl=${encodeURIComponent(callbackURL)}`} className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">By creating an account you agree to our Terms and Privacy Policy.</p>
    </>
  );
}
