import { z } from "zod";
import { engagementTargetTypeSchema } from "./engagements.ts";
import { learningAuthorSchema } from "./threads.ts";

export const reportReasonSchema = z.enum([
  "spam",
  "harassment",
  "inappropriate",
  "misinformation",
  "copyright",
  "other",
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportStatusSchema = z.enum([
  "pending",
  "reviewed",
  "dismissed",
  "actioned",
]);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const moderationActionTypeSchema = z.enum([
  "hide_thread",
  "unhide_thread",
  "lock_thread",
  "unlock_thread",
  "delete_thread",
  "hide_reply",
  "unhide_reply",
  "delete_reply",
  "suspend_user",
  "unsuspend_user",
  "dismiss_report",
  "resolve_report",
]);
export type ModerationActionType = z.infer<typeof moderationActionTypeSchema>;

export const suspensionScopeSchema = z.enum(["commenting", "qa", "all"]);
export type SuspensionScope = z.infer<typeof suspensionScopeSchema>;

export const suspensionDurationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("temporary"),
    durationHours: z.number().int().positive().max(8760), // up to 1 year
  }),
  z.object({
    type: z.literal("permanent"),
  }),
]);
export type SuspensionDuration = z.infer<typeof suspensionDurationSchema>;

export const createReportRequestSchema = z.object({
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
  courseId: z.uuid().optional(),
  reason: reportReasonSchema,
  details: z.string().max(1000).optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const updateReportRequestSchema = z.object({
  status: reportStatusSchema,
  actionTaken: z.string().max(500).optional(),
});
export type UpdateReportRequest = z.infer<typeof updateReportRequestSchema>;

export const learningReportSchema = z.object({
  id: z.uuid(),
  reporterId: z.uuid(),
  reporter: learningAuthorSchema,
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  targetContent: z.string().optional(),
  reason: reportReasonSchema,
  details: z.string().nullable().optional(),
  status: reportStatusSchema,
  reviewedByUserId: z.uuid().nullable().optional(),
  actionTaken: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningReport = z.infer<typeof learningReportSchema>;

export const listReportsQuerySchema = z.object({
  courseId: z.uuid().optional(),
  status: reportStatusSchema.optional(),
  targetType: engagementTargetTypeSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const reportsListResponseSchema = z.object({
  reports: z.array(learningReportSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
});
export type ReportsListResponse = z.infer<typeof reportsListResponseSchema>;

export const moderateThreadRequestSchema = z.object({
  action: z.enum(["hide", "unhide", "lock", "unlock", "delete"]),
  reason: z.string().max(500).optional(),
});
export type ModerateThreadRequest = z.infer<typeof moderateThreadRequestSchema>;

export const moderateReplyRequestSchema = z.object({
  action: z.enum(["hide", "unhide", "delete"]),
  reason: z.string().max(500).optional(),
});
export type ModerateReplyRequest = z.infer<typeof moderateReplyRequestSchema>;

export const suspendUserRequestSchema = z.object({
  userId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  scope: suspensionScopeSchema.default("all"),
  duration: suspensionDurationSchema.default({ type: "temporary", durationHours: 24 }),
  reason: z.string().min(1).max(500),
});
export type SuspendUserRequest = z.infer<typeof suspendUserRequestSchema>;

export const unsuspendUserRequestSchema = z.object({
  userId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  reason: z.string().max(500).optional(),
});
export type UnsuspendUserRequest = z.infer<typeof unsuspendUserRequestSchema>;

export const userSuspensionSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  userId: z.uuid(),
  suspendedByUserId: z.uuid().nullable().optional(),
  scope: suspensionScopeSchema,
  reason: z.string(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type UserSuspension = z.infer<typeof userSuspensionSchema>;

export const suspensionStatusResponseSchema = z.object({
  isSuspended: z.boolean(),
  scope: suspensionScopeSchema.nullable().optional(),
  courseId: z.uuid().nullable().optional(),
  reason: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type SuspensionStatusResponse = z.infer<
  typeof suspensionStatusResponseSchema
>;

export const learningAuditLogSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  actorUserId: z.uuid().nullable().optional(),
  actor: learningAuthorSchema.optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.uuid(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type LearningAuditLog = z.infer<typeof learningAuditLogSchema>;

export const listAuditLogsQuerySchema = z.object({
  courseId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  targetId: z.uuid().optional(),
  action: z.string().optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export const auditLogsListResponseSchema = z.object({
  logs: z.array(learningAuditLogSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogsListResponse = z.infer<typeof auditLogsListResponseSchema>;
