import "server-only";
import { unstable_rethrow } from "next/navigation";
import { isDomainError, ValidationError } from "@/domain/errors";
import { container } from "@/infrastructure/container";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/**
 * Runs a server action body and converts failures into a serialisable result.
 * Domain errors carry user-facing messages; anything else is logged and masked.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error); // let Next.js handle redirect() / notFound()
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
    }
    if (isDomainError(error)) {
      return { ok: false, error: error.message, code: error.code };
    }
    container.logger.error("Unhandled action error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
