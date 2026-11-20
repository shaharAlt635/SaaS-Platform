"use client";

import { Ellipsis, Mail, Trash, UserPlus } from "lucide-react";
import { useState } from "react";
import { SecretField } from "@/components/client";
import { RoleBadge } from "@/components/layout/app-shell";
import { RelativeTime } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, NativeSelect } from "@/components/ui/form-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assignableRoles, canManageMember, isRole, ROLE_META, type Role } from "@/domain/rbac";
import { useAction } from "@/lib/use-action";
import { formatDate } from "@/lib/utils";
import { changeMemberRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "../actions";

interface MemberRow {
  id: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: { name: string; email: string; image: string | null };
}

interface Viewer {
  slug: string;
  userId: string;
  role: Role;
  canUpdate: boolean;
  canRemove: boolean;
}

export function MembersTable({ members, viewer }: { members: MemberRow[]; viewer: Viewer }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="hidden md:table-cell">Joined</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <MemberRowView key={member.id} member={member} viewer={viewer} />
        ))}
      </TableBody>
    </Table>
  );
}

function MemberRowView({ member, viewer }: { member: MemberRow; viewer: Viewer }) {
  const isSelf = member.userId === viewer.userId;
  const manageable = !isSelf && canManageMember(viewer.role, member.role);
  const changeRole = useAction(changeMemberRoleAction, { successMessage: "Role updated" });
  const remove = useAction(removeMemberAction, { successMessage: `${member.user.name} was removed` });

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={member.user.name} image={member.user.image} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {member.user.name} {isSelf && <span className="font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {viewer.canUpdate && manageable ? (
          <NativeSelect
            aria-label={`Role for ${member.user.name}`}
            value={member.role}
            disabled={changeRole.pending}
            onChange={(event) => {
              const role = event.target.value;
              if (isRole(role)) changeRole.execute(viewer.slug, member.id, role);
            }}
            className="h-8 w-32 text-xs"
          >
            {assignableRoles(viewer.role).map((role) => (
              <option key={role} value={role}>
                {ROLE_META[role].label}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(member.joinedAt)}</TableCell>
      <TableCell>
        {viewer.canRemove && manageable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.user.name}`} loading={remove.pending}>
                {!remove.pending && <Ellipsis />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => remove.execute(viewer.slug, member.id)}>
                <Trash /> Remove from organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

export function InviteMemberDialog({ slug, viewerRole, seatsLeft }: { slug: string; viewerRole: Role; seatsLeft: number | null }) {
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("MEMBER");
  const roles = assignableRoles(viewerRole);
  const { execute, pending, fieldError } = useAction(inviteMemberAction, {
    successMessage: ({ email }) => `Invitation sent to ${email}`,
    onSuccess: ({ inviteUrl }) => setInviteUrl(inviteUrl),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInviteUrl(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inviteUrl ? "Invitation sent" : "Invite a teammate"}</DialogTitle>
          <DialogDescription>
            {inviteUrl
              ? "We emailed the invitation. You can also share this link directly — it expires in 7 days."
              : seatsLeft === null
                ? "They'll get an email with a link to join."
                : `They'll get an email with a link to join. ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on your plan.`}
          </DialogDescription>
        </DialogHeader>
        {inviteUrl ? (
          <>
            <SecretField value={inviteUrl} label="Invitation link" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteUrl(null)}>
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              execute(slug, { email: String(data.get("email")), role });
            }}
          >
            <Field id="invite-email" label="Email address" error={fieldError("email")}>
              <Input id="invite-email" name="email" type="email" required placeholder="teammate@company.com" autoFocus />
            </Field>
            <Field id="invite-role" label="Role" hint={ROLE_META[role].description}>
              <NativeSelect
                id="invite-role"
                value={role}
                onChange={(event) => {
                  if (isRole(event.target.value)) setRole(event.target.value);
                }}
              >
                {roles.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_META[value].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <DialogFooter>
              <Button type="submit" loading={pending}>
                <Mail /> Send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PendingInvitations({
  slug,
  invitations,
  canRevoke,
}: {
  slug: string;
  invitations: Array<{ id: string; email: string; role: Role; createdAt: string; expiresAt: string; invitedBy: string | null }>;
  canRevoke: boolean;
}) {
  const revoke = useAction(revokeInvitationAction, { successMessage: "Invitation revoked" });
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="hidden md:table-cell">Expires</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>
              <p className="font-medium">{invitation.email}</p>
              {invitation.invitedBy && <p className="text-xs text-muted-foreground">Invited by {invitation.invitedBy}</p>}
            </TableCell>
            <TableCell>
              <RoleBadge role={invitation.role} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell"><RelativeTime date={invitation.expiresAt} /></TableCell>
            <TableCell className="text-right">
              {canRevoke && (
                <Button variant="ghost" size="sm" disabled={revoke.pending} onClick={() => revoke.execute(slug, invitation.id)}>
                  Revoke
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
