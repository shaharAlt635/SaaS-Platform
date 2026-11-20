import type { Metadata } from "next";
import { can } from "@/application/context";
import { listApiKeys } from "@/application/use-cases/api-keys";
import { getOrganizationPlan } from "@/application/use-cases/billing";
import { AccessDenied, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { PLANS } from "@/domain/plans";
import { ApiKeysTable, CreateApiKeyDialog } from "@/features/api-keys/components/api-keys";
import { container } from "@/infrastructure/container";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getOrgContext((await params).slug);
  if (!can(ctx, "api_keys:read")) return <AccessDenied title="API keys" />;
  const [keys, plan] = await Promise.all([listApiKeys(container, ctx), getOrganizationPlan(container, ctx.organization.id)]);
  const limit = PLANS[plan].limits.apiKeys;
  const active = keys.filter((key) => !key.revokedAt).length;
  const canManage = can(ctx, "api_keys:manage");
  const atLimit = limit !== null && active >= limit;

  return (
    <>
      <PageHeader
        title="API keys"
        description={`${active} active key${active === 1 ? "" : "s"}${limit === null ? "" : ` of ${limit} on your plan`}.`}
        actions={canManage && <CreateApiKeyDialog slug={ctx.organization.slug} disabledReason={atLimit ? "Plan limit reached — upgrade or revoke a key" : undefined} />}
      />
      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <ApiKeysTable
            slug={ctx.organization.slug}
            canManage={canManage}
            keys={keys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              createdAt: key.createdAt.toISOString(),
              lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
              revokedAt: key.revokedAt?.toISOString() ?? null,
              createdBy: key.createdBy?.name ?? null,
            }))}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sending events</CardTitle>
            <CardDescription>POST a single event, or up to 100 at once as {"{ \"events\": [...] }"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">{`curl -X POST ${env.APP_URL}/api/v1/events \\
  -H "Authorization: Bearer ak_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "report_exported",
    "distinctId": "user_42",
    "properties": { "format": "csv" }
  }'`}</pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Responses: <code>202</code> accepted · <code>400</code> invalid payload · <code>401</code> bad key · <code>429</code> rate limit or monthly quota reached.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
