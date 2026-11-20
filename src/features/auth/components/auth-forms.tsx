"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { authClient } from "@/lib/auth-client";

type Provider = "github" | "google";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.26 6.62l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

function SocialButtons({ providers, callbackURL }: { providers: Provider[]; callbackURL: string }) {
  const [pending, setPending] = useState<Provider | null>(null);
  if (providers.length === 0) return null;

  const signIn = async (provider: Provider) => {
    setPending(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL });
    if (error) {
      toast.error(error.message ?? "Couldn't start sign-in.");
      setPending(null);
    }
  };

  return (
    <>
      <div className="grid gap-2">
        {providers.map((provider) => (
          <Button key={provider} variant="outline" className="w-full" loading={pending === provider} disabled={pending !== null} onClick={() => signIn(provider)}>
            {pending !== provider && (provider === "github" ? <GitHubIcon /> : <GoogleIcon />)}
            Continue with {provider === "github" ? "GitHub" : "Google"}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

function useSubmit<T extends Record<string, string>>(handler: (values: T) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      await handler(Object.fromEntries(new FormData(event.currentTarget)) as T);
    } finally {
      setPending(false);
    }
  };
  return { pending, onSubmit };
}

export function SignInForm({ providers, callbackURL }: { providers: Provider[]; callbackURL: string }) {
  const router = useRouter();
  const { pending, onSubmit } = useSubmit<{ email: string; password: string }>(async ({ email, password }) => {
    const { error } = await authClient.signIn.email({ email, password, callbackURL });
    if (error) {
      toast.error(error.status === 403 ? "Please verify your email address first. Check your inbox." : (error.message ?? "Invalid email or password."));
      return;
    }
    router.push(callbackURL);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <SocialButtons providers={providers} callbackURL={callbackURL} />
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
          </Field>
          <Field
            id="password"
            label={
              <span className="flex w-full items-center justify-between">
                Password
                <Link href="/forgot-password" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                  Forgot password?
                </Link>
              </span>
            }
          >
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SignUpForm({ providers, callbackURL, requireVerification }: { providers: Provider[]; callbackURL: string; requireVerification: boolean }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, onSubmit } = useSubmit<{ name: string; email: string; password: string }>(async ({ name, email, password }) => {
    const { error } = await authClient.signUp.email({ name, email, password, callbackURL });
    if (error) {
      toast.error(error.message ?? "Couldn't create your account.");
      return;
    }
    if (requireVerification) {
      setSentTo(email);
      return;
    }
    router.push(callbackURL);
    router.refresh();
  });

  if (sentTo) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Check your inbox</CardTitle>
          <CardDescription>
            We sent a verification link to <span className="font-medium text-foreground">{sentTo}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Start free — no credit card required</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <SocialButtons providers={providers} callbackURL={callbackURL} />
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field id="name" label="Full name">
            <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={64} />
          </Field>
          <Field id="email" label="Work email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
          </Field>
          <Field id="password" label="Password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            Create account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { pending, onSubmit } = useSubmit<{ email: string }>(async ({ email }) => {
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) {
      toast.error(error.message ?? "Couldn't send the reset email.");
      return;
    }
    setSent(true);
  });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>
          {sent ? "If an account exists for that email, a reset link is on its way." : "We'll email you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sent && (
          <form onSubmit={onSubmit} className="grid gap-4">
            <Field id="email" label="Email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Button type="submit" className="w-full" loading={pending}>
              Send reset link
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { pending, onSubmit } = useSubmit<{ password: string; confirm: string }>(async ({ password, confirm }) => {
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      toast.error(error.message ?? "This reset link is invalid or has expired.");
      return;
    }
    toast.success("Password updated. Please sign in.");
    router.push("/sign-in");
  });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field id="password" label="New password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </Field>
          <Field id="confirm" label="Confirm password">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
