import { z } from "zod";
import { ValidationError } from "./errors";
import { ANALYTICS_RANGES } from "./analytics";
import { BILLING_INTERVALS } from "./plans";
import { ROLES } from "./rbac";
import { isReservedSlug, SLUG_PATTERN } from "./slug";

export const organizationNameSchema = z.string().trim().min(2, "Name must be at least 2 characters.").max(64, "Name is too long.");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters.")
  .max(48, "Slug is too long.")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes.")
  .refine((slug) => !isReservedSlug(slug), "This slug is reserved.");

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema.optional(),
});

export const updateOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema,
});

export const deleteOrganizationSchema = z.object({
  confirmation: z.string().trim(),
});

export const roleSchema = z.enum(ROLES);

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: roleSchema,
});

export const changeRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: roleSchema,
});

export const idSchema = z.object({ id: z.string().min(1) });

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(48, "Name is too long."),
});

export const checkoutSchema = z.object({
  plan: z.enum(["PRO", "BUSINESS"]),
  interval: z.enum(BILLING_INTERVALS),
});

export const analyticsRangeSchema = z.enum(ANALYTICS_RANGES).catch("30d");

/** Query parameters for the event explorer; invalid values fall back to "no filter". */
export const eventsQuerySchema = z.object({
  name: z.string().trim().min(1).max(64).optional().catch(undefined),
  cursor: z.string().min(1).max(64).optional().catch(undefined),
});

const propertyValue = z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]);

export const trackEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.:\- ]+$/, "Event names may contain letters, numbers, spaces and _ . : -"),
  distinctId: z.string().trim().min(1).max(128).optional(),
  properties: z
    .record(z.string().max(64), propertyValue)
    .refine((props) => Object.keys(props).length <= 32, "At most 32 properties per event.")
    .optional(),
  timestamp: z.coerce.date().optional(),
});

/** Accepts a single event or `{ events: [...] }` (max 100), normalised to the batch shape. */
export const ingestPayloadSchema = z.preprocess(
  (value) => (value !== null && typeof value === "object" && "events" in value ? value : { events: [value] }),
  z.object({ events: z.array(trackEventSchema).min(1, "Send at least one event.").max(100, "Send at most 100 events per request.") }),
);

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;
export type ChangeRoleInput = z.input<typeof changeRoleSchema>;
export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type IngestPayload = z.input<typeof ingestPayloadSchema>;

/** Parses untrusted input, converting schema failures into a domain ValidationError. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const { fieldErrors, formErrors } = z.flattenError(result.error);
  const first = formErrors[0] ?? Object.values(fieldErrors as Record<string, string[]>).flat()[0] ?? "Invalid input.";
  throw new ValidationError(first, fieldErrors as Record<string, string[]>);
}
