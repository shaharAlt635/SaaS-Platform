import type { Metadata } from "next";
import { can } from "@/application/context";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_META, ROLES } from "@/domain/rbac";
import { DangerZone, OrganizationSettingsForm } from "@/features/organizations/components/organization-forms";
import { container } from "@/infrastructure/container";
import { getOrgContext } from "@/server/session";
import { RoleBadge } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getOrgContext((await params).slug);
  const isOwner = ctx.membership.role === "OWNER";
  const owners = isOwner ? await container.memberships.countByRole(ctx.organization.id, "OWNER") : 0;

  return (
    <>
      <PageHeader title="Settings" description="Manage your organization." />
      <div className="grid gap-6">
        <OrganizationSettingsForm organization={ctx.organization} canEdit={can(ctx, "organization:update")} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Your role <RoleBadge role={ctx.membership.role} />
            </CardTitle>
            <CardDescription>What each role can do in this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role) => (
                <div key={role} className="rounded-lg border p-3">
                  <dt className="text-sm font-medium">{ROLE_META[role].label}</dt>
                  <dd className="mt-0.5 text-sm text-muted-foreground">{ROLE_META[role].description}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <DangerZone slug={ctx.organization.slug} canDelete={can(ctx, "organization:delete")} canLeave={!isOwner || owners > 1} />
      </div>
    </>
  );
}
