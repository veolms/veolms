import { z } from "zod";

/**
 * Support: "Report a problem" and "Send feedback" from Help and feedback,
 * the learner's own list at /support, and the admin queue.
 */

export const supportTicketKinds = ["problem", "feedback"] as const;
export const supportTicketKindSchema = z.enum(supportTicketKinds);
export type SupportTicketKind = z.infer<typeof supportTicketKindSchema>;

export const supportProblemCategories = [
  "video",
  "access",
  "payment",
  "account",
  "bug",
  "other",
] as const;
export const supportFeedbackCategories = [
  "idea",
  "like",
  "confusing",
  "content",
] as const;
export const supportTicketCategorySchema = z.enum([
  ...supportProblemCategories,
  ...supportFeedbackCategories,
]);
export type SupportTicketCategory = z.infer<typeof supportTicketCategorySchema>;

export const supportProblemStatuses = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
] as const;
export const supportFeedbackStatuses = ["new", "reviewed", "planned"] as const;
export const supportTicketStatusSchema = z.enum([
  ...supportProblemStatuses,
  ...supportFeedbackStatuses,
]);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

/** Whether a category or status belongs to this kind of ticket. */
export function supportCategoryFitsKind(
  kind: SupportTicketKind,
  category: SupportTicketCategory,
): boolean {
  return kind === "problem"
    ? (supportProblemCategories as readonly string[]).includes(category)
    : (supportFeedbackCategories as readonly string[]).includes(category);
}

export function supportStatusFitsKind(
  kind: SupportTicketKind,
  status: SupportTicketStatus,
): boolean {
  return kind === "problem"
    ? (supportProblemStatuses as readonly string[]).includes(status)
    : (supportFeedbackStatuses as readonly string[]).includes(status);
}

export const SUPPORT_MESSAGE_MAX_LENGTH = 10_000;
export const SUPPORT_ATTACHMENTS_PER_MESSAGE = 10;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 50_000_000;

export const supportTechnicalDetailsSchema = z.strictObject({
  browser: z.string().trim().max(120).optional(),
  os: z.string().trim().max(120).optional(),
  screen: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(80).optional(),
  userAgent: z.string().trim().max(500).optional(),
});
export type SupportTechnicalDetails = z.infer<
  typeof supportTechnicalDetailsSchema
>;

const attachmentIdsSchema = z
  .array(z.uuid())
  .max(SUPPORT_ATTACHMENTS_PER_MESSAGE)
  .default([]);

export const createSupportTicketRequestSchema = z
  .strictObject({
    kind: supportTicketKindSchema,
    category: supportTicketCategorySchema,
    /** Feedback only. */
    rating: z.number().int().min(1).max(5).nullable().optional(),
    content: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX_LENGTH),
    pagePath: z.string().trim().max(500).nullable().optional(),
    pageLabel: z.string().trim().max(200).nullable().optional(),
    courseId: z.uuid().nullable().optional(),
    technical: supportTechnicalDetailsSchema.nullable().optional(),
    contactAllowed: z.boolean().default(true),
    attachmentIds: attachmentIdsSchema,
  })
  .refine((body) => supportCategoryFitsKind(body.kind, body.category), {
    message: "This category does not belong to this kind of message.",
    path: ["category"],
  });
export type CreateSupportTicketRequest = z.input<
  typeof createSupportTicketRequestSchema
>;

/** The report or feedback just created: where to open it, and its number. */
export const createSupportTicketResponseSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
});
export type CreateSupportTicketResponse = z.infer<
  typeof createSupportTicketResponseSchema
>;

export const createSupportMessageRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX_LENGTH),
  attachmentIds: attachmentIdsSchema,
  /** Staff only: a note the learner never sees. */
  internal: z.boolean().default(false),
  /** Staff only: change the status in the same step. */
  status: supportTicketStatusSchema.optional(),
});
export type CreateSupportMessageRequest = z.input<
  typeof createSupportMessageRequestSchema
>;

export const updateSupportTicketRequestSchema = z.strictObject({
  status: supportTicketStatusSchema,
});
export type UpdateSupportTicketRequest = z.infer<
  typeof updateSupportTicketRequestSchema
>;

export const supportTicketParamsSchema = z.object({ ticketId: z.uuid() });

/** `as=staff`: open it as the team, even a ticket the viewer sent themself. */
export const supportTicketViewQuerySchema = z.object({
  as: z.enum(["staff"]).optional(),
});
export type SupportTicketViewQuery = z.infer<
  typeof supportTicketViewQuerySchema
>;
export const supportAttachmentParamsSchema = z.object({
  attachmentId: z.uuid(),
});

export const supportAttachmentSchema = z.strictObject({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Served by the API to the ticket's owner and support staff only. */
  url: z.string(),
});
export type SupportAttachment = z.infer<typeof supportAttachmentSchema>;

export const supportPersonSchema = z.strictObject({
  id: z.uuid().nullable(),
  name: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type SupportPerson = z.infer<typeof supportPersonSchema>;

export const supportMessageSchema = z.strictObject({
  id: z.uuid(),
  authorRole: z.enum(["user", "staff"]),
  author: supportPersonSchema,
  internal: z.boolean(),
  content: z.string(),
  createdAt: z.string(),
  attachments: z.array(supportAttachmentSchema),
});
export type SupportMessage = z.infer<typeof supportMessageSchema>;

export const supportTicketSummarySchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int(),
  kind: supportTicketKindSchema,
  category: supportTicketCategorySchema,
  rating: z.number().int().nullable(),
  status: supportTicketStatusSchema,
  title: z.string(),
  pageLabel: z.string().nullable(),
  createdAt: z.string(),
  lastMessageAt: z.string(),
  /** Something new for whoever is looking: a reply for the learner, a new message for staff. */
  unread: z.boolean(),
  replyCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
});
export type SupportTicketSummary = z.infer<typeof supportTicketSummarySchema>;

/** Staff lists also show who sent it. */
export const supportAdminTicketSummarySchema =
  supportTicketSummarySchema.extend({
    requester: supportPersonSchema.extend({ email: z.string().nullable() }),
    contactAllowed: z.boolean(),
    snippet: z.string(),
  });
export type SupportAdminTicketSummary = z.infer<
  typeof supportAdminTicketSummarySchema
>;

export const supportTicketDetailSchema = supportTicketSummarySchema.extend({
  content: z.string(),
  pagePath: z.string().nullable(),
  courseId: z.uuid().nullable(),
  technical: supportTechnicalDetailsSchema.nullable(),
  contactAllowed: z.boolean(),
  resolvedAt: z.string().nullable(),
  attachments: z.array(supportAttachmentSchema),
  messages: z.array(supportMessageSchema),
  requester: supportPersonSchema.extend({ email: z.string().nullable() }),
  /** Whether the viewer is answering as support staff. */
  viewerIsStaff: z.boolean(),
});
export type SupportTicketDetail = z.infer<typeof supportTicketDetailSchema>;

export const supportTicketListResponseSchema = z.strictObject({
  tickets: z.array(supportTicketSummarySchema),
});
export type SupportTicketListResponse = z.infer<
  typeof supportTicketListResponseSchema
>;

export const supportAdminListQuerySchema = z.object({
  kind: supportTicketKindSchema,
  status: supportTicketStatusSchema.optional(),
  category: supportTicketCategorySchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type SupportAdminListQuery = z.infer<typeof supportAdminListQuerySchema>;

export const supportAdminListResponseSchema = z.strictObject({
  tickets: z.array(supportAdminTicketSummarySchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
});
export type SupportAdminListResponse = z.infer<
  typeof supportAdminListResponseSchema
>;

export const supportAdminStatsResponseSchema = z.strictObject({
  problems: z.strictObject({
    open: z.number().int(),
    in_progress: z.number().int(),
    waiting: z.number().int(),
    resolved: z.number().int(),
    unread: z.number().int(),
  }),
  feedback: z.strictObject({
    new: z.number().int(),
    reviewed: z.number().int(),
    planned: z.number().int(),
    total: z.number().int(),
    averageRating: z.number().nullable(),
    ratings: z.array(z.number().int()).length(5),
    idea: z.number().int(),
    like: z.number().int(),
    confusing: z.number().int(),
    content: z.number().int(),
    contactable: z.number().int(),
  }),
});
export type SupportAdminStatsResponse = z.infer<
  typeof supportAdminStatsResponseSchema
>;

export const supportUnreadResponseSchema = z.strictObject({
  unread: z.number().int().nonnegative(),
});
export type SupportUnreadResponse = z.infer<typeof supportUnreadResponseSchema>;
