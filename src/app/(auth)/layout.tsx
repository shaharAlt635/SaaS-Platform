import type * as React from "react";
import { Logo } from "@/components/shared";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_70%)]" />
      <div className="grid w-full max-w-sm gap-6">
        <Logo className="justify-self-center" />
        {children}
      </div>
    </main>
  );
}
