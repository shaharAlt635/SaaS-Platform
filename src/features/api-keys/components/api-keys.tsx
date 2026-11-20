"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { SecretField } from "@/components/client";
import { EmptyState, RelativeTime } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";
import { formatDate } from "@/lib/utils";
import { createApiKeyAction, revokeApiKeyAction } from "../actions";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
}

export function CreateApiKeyDialog({ slug, disabledReason }: { slug: string; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const { execute, pending, fieldError } = useAction(createApiKeyAction, {
    successMessage: "API key created",
    onSuccess: ({ secret }) => setSecret(secret),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSecret(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={Boolean(disabledReason)} title={disabledReason}>
          <Plus /> Create key
        </Button>
      </DialogTrigger>
      <DialogContent onInteractOutside={(event) => secret && event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{secret ? "Save your API key" : "Create API key"}</DialogTitle>
          <DialogDescription>
            {secret ? "Copy it now and store it somewhere safe." : "Keys authenticate requests to the events API. Treat them like passwords."}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <Alert variant="warning" title="You won't be able to see this key again." />
            <SecretField value={secret} label="API key" />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>I&apos;ve saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              execute(slug, String(new FormData(event.currentTarget).get("name")));
            }}
          >
            <Field id="key-name" label="Name" error={fieldError("name")} hint="For example “Production backend”.">
              <Input id="key-name" name="name" required minLength={2} maxLength={48} autoFocus />
            </Field>
            <DialogFooter>
              <Button type="submit" loading={pending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysTable({ slug, keys, canManage }: { slug: string; keys: KeyRow[]; canManage: boolean }) {
  const revoke = useAction(revokeApiKeyAction, { successMessage: "API key revoked" });
  const [confirming, setConfirming] = useState<KeyRow | null>(null);

  if (keys.length === 0) {
    return <EmptyState icon={KeyRound} title="No API keys yet" description="Create a key to start sending events from your app." />;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead className="hidden md:table-cell">Last used</TableHead>
            <TableHead className="hidden lg:table-cell">Created</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id} className={key.revokedAt ? "opacity-60" : undefined}>
              <TableCell>
                <p className="font-medium">{key.name}</p>
                {key.createdBy && <p className="text-xs text-muted-foreground">by {key.createdBy}</p>}
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{key.prefix}…</code>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{key.lastUsedAt ? <RelativeTime date={key.lastUsedAt} /> : "Never"}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(key.createdAt)}</TableCell>
              <TableCell className="text-right">
                {key.revokedAt ? (
                  <Badge variant="secondary">Revoked</Badge>
                ) : (
                  canManage && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirming(key)}>
                      Revoke
                    </Button>
                  )
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke “{confirming?.name}”?</DialogTitle>
            <DialogDescription>Requests using this key will fail immediately. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={revoke.pending}
              onClick={() => {
                if (confirming) revoke.execute(slug, confirming.id);
                setConfirming(null);
              }}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
