import { RelativeTime } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import type { AuditLogEntry } from "@/domain/entities";
import { isRole, ROLE_META } from "@/domain/rbac";

const roleLabel = (value: unknown) => (isRole(value) ? ROLE_META[value].label.toLowerCase() : String(value));

/** Human-readable sentence for an audit entry. */
export function describeAuditEntry(entry: AuditLogEntry): string {
  const m = entry.metadata ?? {};
  switch (entry.action) {
    case "organization.created":
      return `created the organization`;
    case "organization.updated":
      return `updated organization settings`;
    case "member.invited":
      return `invited ${String(m.email)} as ${roleLabel(m.role)}`;
    case "member.joined":
      return `joined as ${roleLabel(m.role)}`;
    case "member.role_changed":
      return `changed a member's role from ${roleLabel(m.from)} to ${roleLabel(m.to)}`;
    case "member.removed":
      return "removed a member";
    case "member.left":
      return "left the organization";
    case "invitation.revoked":
      return `revoked the invitation for ${String(m.email)}`;
    case "api_key.created":
      return `created API key “${String(m.name)}”`;
    case "api_key.revoked":
      return `revoked API key “${String(m.name)}”`;
    case "billing.checkout_started":
      return `started checkout for ${String(m.plan).toLowerCase()}`;
    case "billing.subscription_updated":
      return `Subscription is now ${String(m.plan).toLowerCase()} (${String(m.status).toLowerCase().replace("_", " ")})`;
    default:
      return entry.action;
  }
}

export function ActivityFeed({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <ol className="grid gap-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          <Avatar name={entry.actor?.name ?? "System"} image={entry.actor?.image} className="size-7" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-pretty">
              {entry.actor && <span className="font-medium">{entry.actor.name} </span>}
              <span className={entry.actor ? "text-muted-foreground" : ""}>{describeAuditEntry(entry)}</span>
            </p>
            <RelativeTime date={entry.createdAt} className="text-xs text-muted-foreground" />
          </div>
        </li>
      ))}
    </ol>
  );
}
