"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form-controls";
import { slugify } from "@/domain/slug";
import { useAction } from "@/lib/use-action";
import {
  acceptInvitationAction,
  createOrganizationAction,
  deleteOrganizationAction,
  leaveOrganizationAction,
  updateOrganizationAction,
} from "../actions";

export function CreateOrganizationForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);

  const { execute, pending, fieldError } = useAction(createOrganizationAction, {
    successMessage: "Organization created",
    onSuccess: ({ slug }) => {
      onCreated?.();
      router.push(`/o/${slug}`);
    },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        execute({ name, slug: effectiveSlug || undefined });
      }}
    >
      <Field id="org-name" label="Organization name" error={fieldError("name")}>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={64} placeholder="Acme Inc" autoFocus />
      </Field>
      <Field id="org-slug" label="URL" error={fieldError("slug")} hint="Lowercase letters, numbers and dashes.">
        <div className="flex items-center rounded-md border border-input bg-muted/40 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          <span className="pl-3 text-sm text-muted-foreground select-none">/o/</span>
          <input
            id="org-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
            placeholder="acme"
            maxLength={48}
          />
        </div>
      </Field>
      <Button type="submit" loading={pending} className="w-full sm:w-auto sm:justify-self-end">
        Create organization
      </Button>
    </form>
  );
}

export function CreateOrganizationDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>Organizations have their own members, billing and analytics.</DialogDescription>
        </DialogHeader>
        <CreateOrganizationForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationSettingsForm({ organization, canEdit }: { organization: { name: string; slug: string }; canEdit: boolean }) {
  const router = useRouter();
  const { execute, pending, fieldError } = useAction(updateOrganizationAction, {
    successMessage: "Settings saved",
    onSuccess: ({ slug }) => {
      if (slug !== organization.slug) router.replace(`/o/${slug}/settings`);
      else router.refresh();
    },
  });

  return (
    <Card>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          execute(organization.slug, { name: String(data.get("name")), slug: String(data.get("slug")) });
        }}
      >
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Your organization&apos;s name and URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <Field id="name" label="Name" error={fieldError("name")}>
            <Input id="name" name="name" defaultValue={organization.name} required minLength={2} maxLength={64} disabled={!canEdit} />
          </Field>
          <Field id="slug" label="URL slug" error={fieldError("slug")} hint="Changing the slug breaks existing links.">
            <Input id="slug" name="slug" defaultValue={organization.slug} required minLength={3} maxLength={48} disabled={!canEdit} />
          </Field>
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">{canEdit ? "Visible to all members." : "Only admins can change settings."}</p>
          <Button type="submit" size="sm" loading={pending} disabled={!canEdit}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function DangerZone({ slug, canDelete, canLeave }: { slug: string; canDelete: boolean; canLeave: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const remove = useAction(deleteOrganizationAction);
  const leave = useAction(leaveOrganizationAction);

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>These actions can&apos;t be undone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Leave organization</p>
            <p className="text-sm text-muted-foreground">
              {canLeave ? "You'll lose access until someone invites you again." : "Promote another owner before leaving."}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={!canLeave} loading={leave.pending} onClick={() => leave.execute(slug)}>
            Leave
          </Button>
        </div>
        {canDelete && (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete organization</p>
              <p className="text-sm text-muted-foreground">Permanently delete all data and cancel the subscription.</p>
            </div>
            <Dialog onOpenChange={() => setConfirmation("")}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete organization?</DialogTitle>
                  <DialogDescription>
                    This permanently deletes members, API keys, analytics and billing data. Type <strong className="text-foreground">{slug}</strong> to confirm.
                  </DialogDescription>
                </DialogHeader>
                <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-label="Confirm organization slug" autoComplete="off" />
                <DialogFooter>
                  <Button variant="destructive" disabled={confirmation !== slug} loading={remove.pending} onClick={() => remove.execute(slug, confirmation)}>
                    Delete permanently
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AcceptInvitationButton({ token }: { token: string }) {
  const { execute, pending } = useAction(acceptInvitationAction);
  return (
    <Button className="w-full" loading={pending} onClick={() => execute(token)}>
      Accept invitation
    </Button>
  );
}
