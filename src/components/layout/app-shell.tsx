"use client";

import {
  Check,
  ChartColumn,
  ChevronsUpDown,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Rows3,
  ScrollText,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type * as React from "react";
import { ThemeToggle } from "@/components/client";
import { Logo } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlanId } from "@/domain/plans";
import { type Permission, ROLE_META, type Role } from "@/domain/rbac";
import { CreateOrganizationDialog } from "@/features/organizations/components/organization-forms";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { ClientOrgContext } from "@/server/session";

interface ShellProps {
  ctx: ClientOrgContext;
  user: { name: string; email: string; image: string | null };
  organizations: Array<{ name: string; slug: string; role: Role }>;
  plan: { id: PlanId; name: string };
  readOnly: boolean;
  children: React.ReactNode;
}

const NAV: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; permission: Permission }> = [
  { href: "", label: "Overview", icon: LayoutDashboard, permission: "organization:read" },
  { href: "/analytics", label: "Analytics", icon: ChartColumn, permission: "analytics:read" },
  { href: "/events", label: "Events", icon: Rows3, permission: "analytics:read" },
  { href: "/members", label: "Members", icon: Users, permission: "members:read" },
  { href: "/api-keys", label: "API keys", icon: KeyRound, permission: "api_keys:read" },
  { href: "/billing", label: "Billing", icon: CreditCard, permission: "billing:read" },
  { href: "/activity", label: "Audit log", icon: ScrollText, permission: "audit_log:read" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "organization:read" },
];

export function AppShell({ ctx, user, organizations, plan, readOnly, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar lg:flex">
        <SidebarContent ctx={ctx} organizations={organizations} plan={plan} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </DialogTrigger>
            <SheetContent aria-describedby={undefined}>
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <SidebarContent ctx={ctx} organizations={organizations} plan={plan} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Dialog>
          <Logo href="/dashboard" className="lg:hidden" />
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu user={user} />
        </header>
        {readOnly && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-primary/8 px-4 py-2 text-center text-sm">
            <span>
              <span className="font-medium">Shared demo workspace</span>
              <span className="text-muted-foreground"> · read-only, reset nightly. Your own organization unlocks every feature.</span>
            </span>
            <CreateOrganizationDialog
              trigger={
                <Button size="sm" variant="outline" className="h-7">
                  <Plus /> Create organization
                </Button>
              }
            />
          </div>
        )}
        <main className="flex-1 px-4 py-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  ctx,
  organizations,
  plan,
  onNavigate,
}: Pick<ShellProps, "ctx" | "organizations" | "plan"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/o/${ctx.organization.slug}`;
  const allowed = new Set(ctx.permissions);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Logo href="/dashboard" />
      </div>
      <div className="p-3">
        <OrgSwitcher current={ctx.organization} organizations={organizations} />
      </div>
      <nav aria-label="Main" className="grid gap-0.5 px-3">
        {NAV.filter((item) => allowed.has(item.permission)).map(({ href, label, icon: Icon }) => {
          const target = base + href;
          const active = href === "" ? pathname === base : pathname.startsWith(target);
          return (
            <Link
              key={label}
              href={target}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3">
        {plan.id === "FREE" && allowed.has("billing:read") ? (
          <div className="rounded-lg border bg-card p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-primary" /> Upgrade to Pro
            </p>
            <p className="mt-1 text-xs text-muted-foreground">More seats, 90-day history and the audit log.</p>
            <Button asChild size="sm" className="mt-3 w-full">
              <Link href={`${base}/billing`} onClick={onNavigate}>
                View plans
              </Link>
            </Button>
          </div>
        ) : (
          <p className="px-3 text-xs text-muted-foreground">
            {plan.name} plan · {ROLE_META[ctx.role].label}
          </p>
        )}
      </div>
    </div>
  );
}

function OrgSwitcher({
  current,
  organizations,
}: {
  current: { name: string; slug: string };
  organizations: ShellProps["organizations"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border bg-card px-2.5 py-2 text-left shadow-xs transition hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <Avatar name={current.name} square className="size-7" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{current.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem key={org.slug} asChild>
            <Link href={`/o/${org.slug}`}>
              <Avatar name={org.name} square className="size-5 text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              {org.slug === current.slug && <Check className="text-primary!" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <CreateOrganizationDialog
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              <Plus /> New organization
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: ShellProps["user"] }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none" aria-label="Account menu">
          <Avatar name={user.name} image={user.image} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound /> Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={role === "OWNER" ? "default" : "secondary"}>{ROLE_META[role].label}</Badge>;
}
