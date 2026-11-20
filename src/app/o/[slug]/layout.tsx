import type { Metadata } from "next";
import type * as React from "react";
import { getOrganizationPlan } from "@/application/use-cases/billing";
import { listOrganizations } from "@/application/use-cases/organizations";
import { AppShell } from "@/components/layout/app-shell";
import { PLANS } from "@/domain/plans";
import { container } from "@/infrastructure/container";
import { getOrgContext, getSession, toClientContext } from "@/server/session";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const ctx = await getOrgContext((await params).slug);
  return { title: { default: ctx.organization.name, template: `%s · ${ctx.organization.name}` } };
}

export default async function OrganizationLayout({ children, params }: Props) {
  const ctx = await getOrgContext((await params).slug);
  const [session, organizations, planId] = await Promise.all([
    getSession(),
    listOrganizations(container, ctx.actor),
    getOrganizationPlan(container, ctx.organization.id),
  ]);
  const plan = PLANS[planId];

  return (
    <AppShell
      ctx={toClientContext(ctx)}
      user={{ name: ctx.actor.name, email: ctx.actor.email, image: session?.user.image ?? null }}
      organizations={organizations.map(({ name, slug, role }) => ({ name, slug, role }))}
      plan={{ id: plan.id, name: plan.name }}
    >
      {children}
    </AppShell>
  );
}
