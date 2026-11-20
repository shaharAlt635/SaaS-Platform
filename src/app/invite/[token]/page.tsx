import type { Metadata } from "next";
import Link from "next/link";
import { previewInvitation } from "@/application/use-cases/invitations";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { ROLE_META } from "@/domain/rbac";
import { AcceptInvitationButton } from "@/features/organizations/components/organization-forms";
import { container } from "@/infrastructure/container";
import { getActor } from "@/server/session";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, actor] = await Promise.all([previewInvitation(container, token), getActor()]);
  const callback = encodeURIComponent(`/invite/${token}`);

  let body: React.ReactNode;
  if (!invitation || invitation.expired) {
    body = (
      <Alert variant="destructive" title={invitation ? "This invitation has expired" : "Invitation not found"}>
        Ask an admin of the organization to send you a new invitation.
      </Alert>
    );
  } else if (!actor) {
    body = (
      <div className="grid gap-2">
        <Button asChild>
          <Link href={`/sign-up?callbackUrl=${callback}`}>Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/sign-in?callbackUrl=${callback}`}>I already have an account</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">Use {invitation.email} to accept this invitation.</p>
      </div>
    );
  } else if (actor.email.toLowerCase() !== invitation.email.toLowerCase()) {
    body = (
      <Alert variant="warning" title="Wrong account">
        This invitation was sent to <strong>{invitation.email}</strong>, but you&apos;re signed in as {actor.email}. Sign in with the invited email to
        accept it.
      </Alert>
    );
  } else {
    body = <AcceptInvitationButton token={token} />;
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="grid w-full max-w-sm gap-6">
        <Logo className="justify-self-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{invitation ? `Join ${invitation.organizationName}` : "Invitation"}</CardTitle>
            {invitation && !invitation.expired && (
              <CardDescription>
                {invitation.invitedBy ?? "A teammate"} invited you to join as {ROLE_META[invitation.role].label.toLowerCase()}.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>{body}</CardContent>
        </Card>
      </div>
    </main>
  );
}
