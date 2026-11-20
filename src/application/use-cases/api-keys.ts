import type { ApiKey } from "@/domain/entities";
import { NotFoundError } from "@/domain/errors";
import { assertWithinLimit, PLANS } from "@/domain/plans";
import { createApiKeySchema, idSchema, parseInput } from "@/domain/validation";
import { audit } from "../audit";
import { authorize, type OrgContext } from "../context";
import { generateToken, hashToken } from "../crypto";
import type { Dependencies } from "../ports";
import { getOrganizationPlan } from "./billing";

export const API_KEY_PREFIX = "ak_";
const TOUCH_INTERVAL_MS = 60_000;

export async function listApiKeys(deps: Pick<Dependencies, "apiKeys">, ctx: OrgContext): Promise<ApiKey[]> {
  authorize(ctx, "api_keys:read");
  return deps.apiKeys.list(ctx.organization.id);
}

/** Returns the plaintext secret exactly once; only its hash is persisted. */
export async function createApiKey(
  deps: Pick<Dependencies, "apiKeys" | "subscriptions" | "auditLogs" | "logger">,
  ctx: OrgContext,
  input: unknown,
): Promise<{ apiKey: ApiKey; secret: string }> {
  authorize(ctx, "api_keys:manage");
  const { name } = parseInput(createApiKeySchema, input);
  const [plan, active] = await Promise.all([
    getOrganizationPlan(deps, ctx.organization.id),
    deps.apiKeys.countActive(ctx.organization.id),
  ]);
  assertWithinLimit(PLANS[plan].limits.apiKeys, active, 1, "active API keys");

  const secret = `${API_KEY_PREFIX}${generateToken(30)}`;
  const apiKey = await deps.apiKeys.create({
    organizationId: ctx.organization.id,
    name,
    prefix: secret.slice(0, API_KEY_PREFIX.length + 6),
    keyHash: hashToken(secret),
    createdById: ctx.actor.userId,
  });
  await audit(deps, ctx, "api_key.created", { targetType: "api_key", targetId: apiKey.id, metadata: { name } });
  return { apiKey, secret };
}

export async function revokeApiKey(
  deps: Pick<Dependencies, "apiKeys" | "auditLogs" | "logger" | "clock">,
  ctx: OrgContext,
  input: unknown,
): Promise<void> {
  authorize(ctx, "api_keys:manage");
  const { id } = parseInput(idSchema, input);
  const apiKey = await deps.apiKeys.findById(id);
  if (!apiKey || apiKey.organizationId !== ctx.organization.id) throw new NotFoundError("API key");
  if (apiKey.revokedAt) return;
  await deps.apiKeys.revoke(id, deps.clock());
  await audit(deps, ctx, "api_key.revoked", { targetType: "api_key", targetId: id, metadata: { name: apiKey.name } });
}

export async function authenticateApiKey(
  deps: Pick<Dependencies, "apiKeys" | "clock">,
  secret: string | null | undefined,
): Promise<ApiKey | null> {
  if (!secret?.startsWith(API_KEY_PREFIX)) return null;
  const apiKey = await deps.apiKeys.findActiveByHash(hashToken(secret));
  if (!apiKey) return null;

  const now = deps.clock();
  // Throttle writes: hot keys would otherwise update the row on every request.
  if (!apiKey.lastUsedAt || now.getTime() - apiKey.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await deps.apiKeys.touch(apiKey.id, now);
  }
  return apiKey;
}
