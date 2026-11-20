import type { AuditLogEntry } from "@/domain/entities";
import { PlanLimitError } from "@/domain/errors";
import { PLANS } from "@/domain/plans";
import { authorize, type OrgContext } from "../context";
import type { Dependencies } from "../ports";
import { getOrganizationPlan } from "./billing";

export async function listAuditLog(
  deps: Pick<Dependencies, "auditLogs" | "subscriptions">,
  ctx: OrgContext,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ items: AuditLogEntry[]; nextCursor: string | null }> {
  authorize(ctx, "audit_log:read");
  const plan = await getOrganizationPlan(deps, ctx.organization.id);
  if (!PLANS[plan].auditLog) throw new PlanLimitError("The audit log is available on the Pro and Business plans.");
  return deps.auditLogs.list(ctx.organization.id, { limit: Math.min(options.limit ?? 25, 100), cursor: options.cursor });
}
