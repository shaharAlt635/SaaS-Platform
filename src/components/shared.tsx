import { ArrowDownRight, ArrowUpRight, LockKeyhole, Minus } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { site } from "@/config/site";
import { cn, formatDate, formatRelative } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path d="M4 18 10 8l4 6 6-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{site.name}</span>
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Up/down delta with an icon and sign, so direction never relies on color alone. */
export function Delta({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("text-xs text-muted-foreground", className)}>No prior data</span>;
  const rounded = Math.round(value * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  const tone = rounded > 0 ? "text-success" : rounded < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {rounded > 0 ? "+" : ""}
      {rounded}%<span className="sr-only"> versus previous period</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 flex min-h-4 items-center gap-2 text-xs text-muted-foreground">
        {delta !== undefined && <Delta value={delta} />}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * "5 minutes ago" depends on the current time, so server and client output can differ
 * by the time the page hydrates; the absolute date stays available as a tooltip.
 */
export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const value = new Date(date);
  return (
    <time dateTime={value.toISOString()} title={formatDate(value, { dateStyle: "medium", timeStyle: "short" })} className={className} suppressHydrationWarning>
      {formatRelative(value)}
    </time>
  );
}

/** Shown when a member opens a page their role doesn't grant. The server still enforces access. */
export function AccessDenied({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-xl border bg-card shadow-xs">
        <EmptyState icon={LockKeyhole} title="You don't have access to this page" description="Ask an owner or admin of this organization if you need access." />
      </div>
    </>
  );
}
