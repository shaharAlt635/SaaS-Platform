"use client";

import { Check, Copy, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import type * as React from "react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Theme, THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

// ── Theme store: the <head> script sets the initial class; this keeps it in sync. ──
const listeners = new Set<() => void>();
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && darkQuery().matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  listeners.forEach((listener) => listener());
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page only.
  }
  applyTheme(theme);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const query = darkQuery();
  const onSystemChange = () => storedTheme() === "system" && applyTheme("system");
  query.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", onSystemChange);
  };
}

function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useResolvedTheme();
  return (
    <>
      {children}
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </>
  );
}

export function ThemeToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Change theme">
          <Sun className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn("shrink-0", className)}
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

/** Read-only monospace value with a copy button (API keys, invite links, code). */
export function SecretField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <code
        aria-label={label}
        className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-md border bg-muted/50 px-3 font-mono text-xs whitespace-nowrap"
      >
        {value}
      </code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** Re-fetches the current page's server data in place — no full reload, scroll and state are kept. */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-label={label}>
      <RefreshCw className={cn(pending && "animate-spin")} />
      <span className="max-sm:sr-only">{pending ? "Refreshing…" : label}</span>
    </Button>
  );
}

/** Select bound to a URL search parameter; changing it resets pagination. */
export function SearchParamSelect({
  param,
  label,
  options,
  allLabel,
}: {
  param: string;
  label: string;
  options: string[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(param) ?? "";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = new URLSearchParams();
        if (event.target.value) next.set(param, event.target.value);
        router.push(next.size ? `${pathname}?${next}` : pathname);
      }}
      className="h-8 max-w-52 rounded-md border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
