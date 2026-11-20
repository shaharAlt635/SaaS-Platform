import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { enabledSocialProviders } from "@/infrastructure/auth";
import { safeRedirect } from "@/lib/utils";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const callbackURL = safeRedirect((await searchParams).callbackUrl);
  if (await getSession()) redirect(callbackURL);

  return (
    <>
      <SignInForm providers={enabledSocialProviders} callbackURL={callbackURL} />
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href={`/sign-up?callbackUrl=${encodeURIComponent(callbackURL)}`} className="font-medium text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
