"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { authClient } from "@/lib/auth-client";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const { error } = await authClient.updateUser({ name: String(new FormData(event.currentTarget).get("name")).trim() });
    setPending(false);
    if (error) return void toast.error(error.message ?? "Couldn't update your profile.");
    toast.success("Profile updated");
    router.refresh();
  };

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear to your teammates.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <Field id="name" label="Name">
            <Input id="name" name="name" defaultValue={name} required minLength={2} maxLength={64} autoComplete="name" />
          </Field>
          <Field id="email" label="Email" hint="Contact support to change your email address.">
            <Input id="email" value={email} disabled readOnly />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirm"))) return void toast.error("New passwords don't match.");

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) return void toast.error(error.message ?? "Couldn't change your password.");
    form.reset();
    toast.success("Password changed. Other sessions were signed out.");
  };

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password signs you out everywhere else.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <Field id="currentPassword" label="Current password">
            <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field id="newPassword" label="New password" hint="At least 8 characters.">
            <Input id="newPassword" name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </Field>
          <Field id="confirm" label="Confirm new password">
            <Input id="confirm" name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" size="sm" loading={pending}>
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
