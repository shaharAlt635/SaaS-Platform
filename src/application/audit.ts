import type { OrgContext } from "./context";
import type { Dependencies } from "./ports";

export type AuditAction =
  | "organization.created"
  | "organization.updated"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "invitation.revoked"
  | "api_key.created"
  | "api_key.revoked"
  | "billing.checkout_started"
  | "billing.subscription_updated";

export async function audit(
  deps: Pick<Dependencies, "auditLogs" | "logger">,
  ctx: OrgContext | { organizationId: string; actorId: string | null },
  action: AuditAction,
  details: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const organizationId = "organization" in ctx ? ctx.organization.id : ctx.organizationId;
  const actorId = "actor" in ctx ? ctx.actor.userId : ctx.actorId;
  try {
    await deps.auditLogs.record({ organizationId, actorId, action, ...details });
  } catch (error) {
    // The audit trail must never break the operation it describes.
    deps.logger.error("Failed to write audit log", { action, organizationId, error: String(error) });
  }
}
