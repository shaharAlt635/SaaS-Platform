import {
  ChartColumn,
  CreditCard,
  KeyRound,
  LockKeyhole,
  ScrollText,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/shared";
import { ThemeToggle } from "@/components/client";
import { Button } from "@/components/ui/button";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { DemoButton } from "@/features/auth/components/demo-button";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { getSession } from "@/server/session";

const FEATURES = [
  { icon: ChartColumn, title: "Real-time analytics", body: "Track events from any stack and see trends, top events and unique users instantly." },
  { icon: UsersRound, title: "Built for teams", body: "Organizations, invitations and four roles so everyone gets exactly the access they need." },
  { icon: LockKeyhole, title: "Secure by default", body: "Hashed API keys and tokens, scoped permissions and rate-limited endpoints." },
  { icon: CreditCard, title: "Simple billing", body: "Self-serve upgrades, trials and invoices powered by Stripe Checkout and the customer portal." },
  { icon: KeyRound, title: "Developer friendly", body: "A single REST endpoint. Send one event or a batch of a hundred with any HTTP client." },
  { icon: ScrollText, title: "Audit log", body: "Every sensitive change is recorded, so you always know who did what and when." },
];

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {session ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_65%)]" />
          <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-20 pb-16 text-center sm:pt-28">
            <div className="mx-auto grid max-w-3xl gap-6">
              <p className="mx-auto rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
                Now with team audit logs on Pro
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
                Understand your product. <span className="text-primary">Grow with your team.</span>
              </h1>
              <p className="mx-auto max-w-xl text-lg text-muted-foreground text-balance">{site.description}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/sign-up">Start for free</Link>
                </Button>
                {env.DEMO_MODE ? (
                  <DemoButton size="lg" variant="outline" />
                ) : (
                  <Button asChild size="lg" variant="outline">
                    <a href="#pricing">See pricing</a>
                  </Button>
                )}
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Everything a modern team needs</h2>
              <p className="mt-3 text-muted-foreground">From the first event to the first enterprise customer.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-card p-6 shadow-xs">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 border-t">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Simple, predictable pricing</h2>
              <p className="mt-3 text-muted-foreground">Start free. Upgrade when your team grows.</p>
            </div>
            <PricingTable mode="marketing" />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

/** Static, decorative dashboard preview for the hero. */
function ProductPreview() {
  const bars = [32, 41, 38, 52, 47, 60, 58, 66, 61, 74, 70, 82, 79, 90];
  return (
    <div aria-hidden className="mx-auto w-full max-w-4xl rounded-2xl border bg-card p-2 shadow-2xl shadow-primary/10">
      <div className="rounded-xl border bg-background p-4 text-left sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Events", "284.1k", "+12.4%"],
            ["Unique users", "18.2k", "+8.1%"],
            ["Events / user", "15.6", "+3.9%"],
            ["Members", "12", "Pro plan"],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-success">{hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-40 items-end gap-1.5 rounded-lg border bg-card p-4">
          {bars.map((height, index) => (
            <div key={index} className="flex-1 rounded-t-[4px] bg-chart-1/85" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
