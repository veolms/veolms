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

export const createReportRequestSchema = z.object({
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
  reason: reportReasonSchema,
  details: z.string().max(1000).optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const learningReportSchema = z.object({
  id: z.uuid(),
  reporterId: z.uuid(),
  reporter: learningAuthorSchema,
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
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
  reason: z.string().min(1).max(500),
  durationHours: z.number().int().positive().optional(),
  permanent: z.boolean().default(false),
});
export type SuspendUserRequest = z.infer<typeof suspendUserRequestSchema>;

export const userSuspensionSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  userId: z.uuid(),
  suspendedByUserId: z.uuid(),
  reason: z.string(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type UserSuspension = z.infer<typeof userSuspensionSchema>;

export const suspensionStatusResponseSchema = z.object({
  isSuspended: z.boolean(),
  reason: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type SuspensionStatusResponse = z.infer<
  typeof suspensionStatusResponseSchema
>;

export const learningAuditLogSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  actorUserId: z.uuid(),
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
