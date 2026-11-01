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

/**
 * A report as a course moderator sees it. The reporter stays anonymous here:
 * the course owner moderates their own course and is often the person a
 * learner reported.
 */
export const courseLearningReportSchema = z.object({
  id: z.uuid(),
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  reason: reportReasonSchema,
  details: z.string().nullable().optional(),
  status: reportStatusSchema,
  reviewedByUserId: z.uuid().nullable().optional(),
  actionTaken: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourseLearningReport = z.infer<typeof courseLearningReportSchema>;

/** The platform (administrator) view, which also says who filed the report. */
export const learningReportSchema = courseLearningReportSchema.extend({
  reporterId: z.uuid(),
  reporter: learningAuthorSchema,
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

export const courseReportsListResponseSchema = z.object({
  reports: z.array(courseLearningReportSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
});
export type CourseReportsListResponse = z.infer<
  typeof courseReportsListResponseSchema
>;

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

/**
 * A shared note is the learner's own study material, so moderation takes it
 * out of view rather than deleting it: the note becomes private and its
 * author can no longer share it.
 */
export const moderateNoteRequestSchema = z.object({
  action: z.enum(["make_private"]),
  reason: z.string().max(500).optional(),
});
export type ModerateNoteRequest = z.infer<typeof moderateNoteRequestSchema>;

export const suspendUserRequestSchema = z.object({
  userId: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  scope: suspensionScopeSchema.default("all"),
  duration: suspensionDurationSchema.default({
    type: "temporary",
    durationHours: 24,
  }),
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

/**
 * What a moderation action recorded about itself. Each action writes a subset:
 * content actions a `reason`; report updates `reportId`, `status` and
 * `actionTaken`; suspensions `reason`, `scope`, `courseId` and `expiresAt`.
 */
export const learningAuditLogDetailsSchema = z.object({
  reason: z.string().nullable().optional(),
  reportId: z.string().optional(),
  status: z.string().optional(),
  actionTaken: z.string().nullable().optional(),
  scope: z.string().optional(),
  courseId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type LearningAuditLogDetails = z.infer<
  typeof learningAuditLogDetailsSchema
>;

/** An audit entry as a course moderator sees it: no network address. */
export const courseAuditLogSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid().nullable().optional(),
  actorUserId: z.uuid().nullable().optional(),
  actor: learningAuthorSchema.optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.uuid(),
  details: learningAuditLogDetailsSchema.nullable().optional(),
  createdAt: z.string(),
});
export type CourseAuditLog = z.infer<typeof courseAuditLogSchema>;

/** The platform (administrator) view, which keeps the actor's address. */
export const learningAuditLogSchema = courseAuditLogSchema.extend({
  ipAddress: z.string().nullable().optional(),
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

export const courseAuditLogsListResponseSchema = z.object({
  logs: z.array(courseAuditLogSchema),
  nextCursor: z.string().nullable(),
});
export type CourseAuditLogsListResponse = z.infer<
  typeof courseAuditLogsListResponseSchema
>;

export const auditLogsListResponseSchema = z.object({
  logs: z.array(learningAuditLogSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogsListResponse = z.infer<typeof auditLogsListResponseSchema>;
