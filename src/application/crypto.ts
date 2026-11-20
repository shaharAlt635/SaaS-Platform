import { createHash, randomBytes } from "node:crypto";

/** URL-safe random token with `bytes` bytes of entropy. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Secrets are stored as SHA-256 digests; they're high-entropy so a slow hash isn't needed. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
