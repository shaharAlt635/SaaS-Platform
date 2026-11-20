import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <>
        <Alert variant="destructive" title="This reset link is invalid or has expired.">
          Request a new link to reset your password.
        </Alert>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="font-medium hover:underline">
            Request a new link
          </Link>
        </p>
      </>
    );
  }
  return <ResetPasswordForm token={token} />;
}
