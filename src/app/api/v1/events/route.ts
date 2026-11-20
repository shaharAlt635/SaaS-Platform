import { ingestEvents } from "@/application/use-cases/analytics";
import { authenticateApiKey } from "@/application/use-cases/api-keys";
import { isDomainError, ValidationError } from "@/domain/errors";
import { container } from "@/infrastructure/container";
import { MemoryRateLimiter } from "@/infrastructure/rate-limit";

// 600 requests / minute per API key (each request may carry up to 100 events).
const limiter = new MemoryRateLimiter(600, 60_000);
const MAX_BODY_BYTES = 256 * 1024;

function error(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: HeadersInit) {
  return Response.json({ error: { code, message, ...extra } }, { status, headers });
}

/**
 * Event ingestion endpoint.
 *
 *   curl -X POST $APP_URL/api/v1/events \
 *     -H "Authorization: Bearer ak_..." -H "Content-Type: application/json" \
 *     -d '{"name":"signup","distinctId":"user_42","properties":{"plan":"pro"}}'
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKey = await authenticateApiKey(container, token);
  if (!apiKey) return error(401, "unauthorized", "Missing or invalid API key.");

  const rate = limiter.check(apiKey.id);
  const rateHeaders = { "X-RateLimit-Remaining": String(rate.remaining), "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)) };
  if (!rate.allowed) {
    return error(429, "rate_limited", "Too many requests.", undefined, { ...rateHeaders, "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return error(413, "payload_too_large", "Request body exceeds 256 KB.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return error(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    const result = await ingestEvents(container, apiKey, payload);
    return Response.json(result, { status: 202, headers: rateHeaders });
  } catch (err) {
    if (err instanceof ValidationError) return error(400, "invalid_request", err.message, { fields: err.fieldErrors });
    if (isDomainError(err) && err.code === "PLAN_LIMIT") return error(429, "quota_exceeded", err.message);
    container.logger.error("Event ingestion failed", { error: String(err), organizationId: apiKey.organizationId });
    return error(500, "internal_error", "Something went wrong.");
  }
}
