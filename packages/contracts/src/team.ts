import { z } from "zod";
import { permissionSchema } from "./permissions.ts";

/** How long an invite link or an add-by-email entry stays open. */
export const TEAM_INVITATION_TTL_DAYS = 7;

export const TEAM_ROLE_NAME_MAX_LENGTH = 60;
export const TEAM_ROLE_DESCRIPTION_MAX_LENGTH = 300;
export const TEAM_INVITATION_MESSAGE_MAX_LENGTH = 1000;
export const TEAM_INVITATION_MAX_EMAILS = 50;

export const teamErrorCodes = [
  "LAST_ADMIN",
  "ROLE_IN_USE",
  "ROLE_IS_SYSTEM",
  "ROLE_NAME_TAKEN",
  "PRIVILEGE_ESCALATION",
  "SELF_LOCKOUT",
  "INVITE_INVALID",
  "INVITE_ALREADY_USED",
  "INVITE_EMAIL_MISMATCH",
] as const;
export type TeamErrorCode = (typeof teamErrorCodes)[number];

const emailSchema = z.string().trim().toLowerCase().email().max(254);

// --- Roles ---

export const teamRoleSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
  memberCount: z.number().int().nonnegative(),
});
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const teamRoleListResponseSchema = z.strictObject({
  roles: z.array(teamRoleSchema),
  /** False while custom roles are switched off for this platform. */
  customRolesEnabled: z.boolean(),
});
export type TeamRoleListResponse = z.infer<typeof teamRoleListResponseSchema>;

export const teamRoleUpsertRequestSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(TEAM_ROLE_NAME_MAX_LENGTH)
    .regex(/^[\p{L}\p{N} _-]+$/u, "Use letters, numbers, spaces, - or _"),
  description: z
    .string()
    .trim()
    .max(TEAM_ROLE_DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional(),
  permissions: z.array(permissionSchema).min(1).max(200),
});
export type TeamRoleUpsertRequest = z.infer<typeof teamRoleUpsertRequestSchema>;

export const teamRoleParamsSchema = z.object({
  roleId: z.string().uuid(),
});

// --- Members ---

export const teamMemberRoleSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  isSystem: z.boolean(),
});
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;

export const teamMemberStatusSchema = z.enum(["active", "awaiting_sign_in"]);
export type TeamMemberStatus = z.infer<typeof teamMemberStatusSchema>;

export const teamMemberSchema = z.strictObject({
  status: teamMemberStatusSchema,
  /** Null while the person has not signed in yet. */
  userId: z.string().uuid().nullable(),
  /** Set for `awaiting_sign_in` rows; used to change roles or cancel. */
  invitationId: z.string().uuid().nullable(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(teamMemberRoleSchema),
  joinedAt: z.string().datetime().nullable(),
  lastActiveAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamMemberListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
});
export type TeamMemberListQuery = z.infer<typeof teamMemberListQuerySchema>;

export const teamMemberListResponseSchema = z.strictObject({
  members: z.array(teamMemberSchema),
  nextCursor: z.string().nullable(),
  /** Sent with the first page only (no cursor). */
  totalCount: z.number().int().nonnegative().optional(),
});
export type TeamMemberListResponse = z.infer<
  typeof teamMemberListResponseSchema
>;

export const teamMemberParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const setTeamMemberRolesRequestSchema = z.strictObject({
  /** The full set of team roles; an empty list takes the person off the team. */
  roleIds: z.array(z.string().uuid()).max(50),
});
export type SetTeamMemberRolesRequest = z.infer<
  typeof setTeamMemberRolesRequestSchema
>;

export const teamUserSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});
export type TeamUserSearchQuery = z.infer<typeof teamUserSearchQuerySchema>;

export const teamUserSearchResultSchema = z.strictObject({
  userId: z.string().uuid(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  isMember: z.boolean(),
  roles: z.array(teamMemberRoleSchema),
});
export type TeamUserSearchResult = z.infer<typeof teamUserSearchResultSchema>;

export const teamUserSearchResponseSchema = z.strictObject({
  users: z.array(teamUserSearchResultSchema),
});
export type TeamUserSearchResponse = z.infer<
  typeof teamUserSearchResponseSchema
>;

// --- Invitations ---

export const teamInvitationKindSchema = z.enum(["invite", "preapproved"]);
export type TeamInvitationKind = z.infer<typeof teamInvitationKindSchema>;

export const teamInvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export type TeamInvitationStatus = z.infer<typeof teamInvitationStatusSchema>;

export const teamInvitationSchema = z.strictObject({
  id: z.string().uuid(),
  email: z.string(),
  kind: teamInvitationKindSchema,
  status: teamInvitationStatusSchema,
  roles: z.array(teamMemberRoleSchema),
  message: z.string().nullable(),
  invitedBy: z
    .strictObject({ userId: z.string().uuid(), name: z.string().nullable() })
    .nullable(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  lastSentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamInvitationListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["all", ...teamInvitationStatusSchema.options]).default("all"),
});
export type TeamInvitationListQuery = z.infer<
  typeof teamInvitationListQuerySchema
>;

export const teamInvitationListResponseSchema = z.strictObject({
  invitations: z.array(teamInvitationSchema),
  nextCursor: z.string().nullable(),
});
export type TeamInvitationListResponse = z.infer<
  typeof teamInvitationListResponseSchema
>;

export const createTeamInvitationsRequestSchema = z.strictObject({
  emails: z.array(emailSchema).min(1).max(TEAM_INVITATION_MAX_EMAILS),
  roleIds: z.array(z.string().uuid()).min(1).max(50),
  kind: teamInvitationKindSchema,
  /** Pre-approved only: also email the person to say they were added. */
  notify: z.boolean().default(true),
  message: z
    .string()
    .trim()
    .max(TEAM_INVITATION_MESSAGE_MAX_LENGTH)
    .nullable()
    .optional(),
});
export type CreateTeamInvitationsRequest = z.infer<
  typeof createTeamInvitationsRequestSchema
>;

export const teamInvitationOutcomeSchema = z.enum([
  /** Invite link sent. */
  "invited",
  /** Roles wait for the person's first sign-in. */
  "preapproved",
  /** The email belonged to an account; roles were applied at once. */
  "promoted",
  /** An open invitation for this email got the new roles. */
  "updated",
  /** The person already holds every one of these roles. */
  "already_member",
  "failed",
]);
export type TeamInvitationOutcome = z.infer<typeof teamInvitationOutcomeSchema>;

export const createTeamInvitationsResponseSchema = z.strictObject({
  results: z.array(
    z.strictObject({
      email: z.string(),
      outcome: teamInvitationOutcomeSchema,
      invitationId: z.string().uuid().nullable(),
      userId: z.string().uuid().nullable(),
      /** Set when outcome is `failed`. */
      error: z.string().nullable(),
      /** False when the email could not be sent; the invite can be resent. */
      emailSent: z.boolean(),
    }),
  ),
});
export type CreateTeamInvitationsResponse = z.infer<
  typeof createTeamInvitationsResponseSchema
>;

export const updateTeamInvitationRequestSchema = z.strictObject({
  roleIds: z.array(z.string().uuid()).min(1).max(50),
});
export type UpdateTeamInvitationRequest = z.infer<
  typeof updateTeamInvitationRequestSchema
>;

export const teamInvitationParamsSchema = z.object({
  invitationId: z.string().uuid(),
});

// --- Public invite link ---

export const invitationTokenParamsSchema = z.object({
  token: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export const invitationPreviewSchema = z.strictObject({
  academyName: z.string(),
  invitedByName: z.string().nullable(),
  /** Masked, e.g. "ni***@getgtm.ai", so a leaked link does not reveal it. */
  emailHint: z.string(),
  roles: z.array(z.string()),
  message: z.string().nullable(),
  expiresAt: z.string().datetime(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationResponseSchema = z.strictObject({
  roles: z.array(teamMemberRoleSchema),
});
export type AcceptInvitationResponse = z.infer<
  typeof acceptInvitationResponseSchema
>;
