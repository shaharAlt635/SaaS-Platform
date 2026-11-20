/**
 * Domain errors carry a stable `code` so every delivery mechanism (server actions,
 * REST routes, webhooks) can map them to the right response without string matching.
 */
export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "PLAN_LIMIT"
  | "BILLING_UNAVAILABLE"
  | "RATE_LIMITED";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "You need to sign in to continue.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You don't have permission to perform this action.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found.`);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export type FieldErrors = Record<string, string[] | undefined>;

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super("VALIDATION", message);
  }
}

export class PlanLimitError extends DomainError {
  constructor(message: string) {
    super("PLAN_LIMIT", message);
  }
}

export class BillingUnavailableError extends DomainError {
  constructor(message = "Billing is not configured for this deployment.") {
    super("BILLING_UNAVAILABLE", message);
  }
}

export class RateLimitedError extends DomainError {
  constructor(message = "Too many requests. Please slow down.") {
    super("RATE_LIMITED", message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
