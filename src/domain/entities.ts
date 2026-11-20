import type { Role } from "./rbac";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId: string | null;
  createdAt: Date;
}

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface Member extends Membership {
  user: UserSummary;
  joinedAt: Date;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: Pick<UserSummary, "name" | "email"> | null;
}

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: Pick<UserSummary, "name" | "email"> | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  actor: UserSummary | null;
}

export interface TrackedEvent {
  name: string;
  distinctId: string | null;
  properties: Record<string, unknown> | null;
  occurredAt: Date;
}
