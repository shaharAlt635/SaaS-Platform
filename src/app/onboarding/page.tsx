import type { Metadata } from "next";
import { Logo } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateOrganizationForm } from "@/features/organizations/components/organization-forms";
import { requireActor } from "@/server/session";

export const metadata: Metadata = { title: "Create your organization" };

export default async function OnboardingPage() {
  const actor = await requireActor();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="grid w-full max-w-md gap-6">
        <Logo className="justify-self-center" href="/dashboard" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Welcome, {actor.name.split(" ")[0]}!</CardTitle>
            <CardDescription>Create an organization to start tracking events with your team.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrganizationForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
