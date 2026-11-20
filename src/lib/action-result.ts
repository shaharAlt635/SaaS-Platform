import type { DomainErrorCode, FieldErrors } from "@/domain/errors";

/** Serializable result returned by every server action. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DomainErrorCode; fieldErrors?: FieldErrors };
