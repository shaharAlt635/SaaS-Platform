import { CircleExclamationPoint, Info, TriangleExclamationPoint } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

const ALERT_STYLES = {
  info: { icon: Info, className: "border-primary/20 bg-primary/5 [&>svg]:text-primary" },
  warning: { icon: TriangleExclamationPoint, className: "border-warning/30 bg-warning/8 [&>svg]:text-warning" },
  destructive: { icon: CircleExclamationPoint, className: "border-destructive/30 bg-destructive/5 [&>svg]:text-destructive" },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
  action,
  className,
}: {
  variant?: keyof typeof ALERT_STYLES;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: tone } = ALERT_STYLES[variant];
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-lg border p-4 text-sm", tone, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid flex-1 gap-1">
        <p className="font-medium">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Usage meter; `null` limit renders as unlimited. */
export function Meter({ value, max, label }: { value: number; max: number | null; label: string }) {
  const ratio = max === null || max === 0 ? 0 : Math.min(1, value / max);
  const tone = ratio >= 0.9 ? "bg-destructive" : ratio >= 0.75 ? "bg-warning" : "bg-primary";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max ?? undefined}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: max === null ? "4%" : `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%` }} />
    </div>
  );
}
