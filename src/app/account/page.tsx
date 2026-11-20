import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/client";
import { Logo, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm, ProfileForm } from "@/features/account/components/account-forms";
import { db } from "@/infrastructure/db";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackUrl=/account");
  const accounts = await db.account.findMany({ where: { userId: session.user.id }, select: { providerId: true } });
  const hasPassword = accounts.some((account) => account.providerId === "credential");
  const linked = accounts.filter((account) => account.providerId !== "credential").map((account) => account.providerId);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo href="/dashboard" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/dashboard">
            <ArrowLeft /> Back to dashboard
          </Link>
        </Button>
        <PageHeader title="Account" description="Your personal profile and security settings." />
        <div className="grid gap-6">
          <ProfileForm name={session.user.name} email={session.user.email} />
          {hasPassword && <PasswordForm />}
          <Card>
            <CardHeader>
              <CardTitle>Connected accounts</CardTitle>
              <CardDescription>Sign-in methods linked to your account.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {[hasPassword && "Email & password", ...linked.map((provider) => provider[0]!.toUpperCase() + provider.slice(1))].filter(Boolean).join(" · ")}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
