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
  // A comment, reply or question someone reported from Discussions.
  "post",
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

/** How urgent the team thinks it is. None until someone sets it. */
export const supportPriorities = ["low", "medium", "high", "urgent"] as const;
export const supportPrioritySchema = z.enum(supportPriorities);
export type SupportPriority = z.infer<typeof supportPrioritySchema>;

/**
 * Staff change a report or feedback: its status, who works on it, its
 * priority or its category. At least one, any together.
 */
export const updateSupportTicketRequestSchema = z
  .strictObject({
    status: supportTicketStatusSchema.optional(),
    /** A member of the support team, or null to unassign. */
    assigneeId: z.uuid().nullable().optional(),
    priority: supportPrioritySchema.nullable().optional(),
    category: supportTicketCategorySchema.optional(),
  })
  .refine(
    (body) =>
      body.status !== undefined ||
      body.assigneeId !== undefined ||
      body.priority !== undefined ||
      body.category !== undefined,
    { message: "Nothing to change." },
  );
export type UpdateSupportTicketRequest = z.infer<
  typeof updateSupportTicketRequestSchema
>;

/** An internal note rewritten by its author or an admin. */
export const updateSupportNoteRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX_LENGTH),
});
export type UpdateSupportNoteRequest = z.infer<
  typeof updateSupportNoteRequestSchema
>;

export const pinSupportNoteRequestSchema = z.strictObject({
  pinned: z.boolean(),
});
export type PinSupportNoteRequest = z.infer<typeof pinSupportNoteRequestSchema>;

export const supportTicketParamsSchema = z.object({ ticketId: z.uuid() });
export const supportNoteParamsSchema = z.object({
  ticketId: z.uuid(),
  messageId: z.uuid(),
});

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
  /** When an internal note was last edited; null when it never was. */
  editedAt: z.string().nullable(),
  /** Internal notes only: pinned to the top of the Activity log. */
  pinned: z.boolean(),
  attachments: z.array(supportAttachmentSchema),
});
export type SupportMessage = z.infer<typeof supportMessageSchema>;

export const supportEventTypes = [
  "assigned",
  "unassigned",
  "status_changed",
  "priority_changed",
  "category_changed",
  "note_pinned",
  "note_unpinned",
  "note_deleted",
] as const;
export const supportEventTypeSchema = z.enum(supportEventTypes);
export type SupportEventType = z.infer<typeof supportEventTypeSchema>;

/** Something the team did to a ticket, in its Activity log. */
export const supportEventSchema = z.strictObject({
  id: z.uuid(),
  type: supportEventTypeSchema,
  actor: supportPersonSchema,
  createdAt: z.string(),
  /** For a status, priority or category change: the values before and after. */
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** For an assignment: who it went to. */
  assignee: supportPersonSchema.nullable(),
  /** For a note pinned, unpinned or deleted. */
  messageId: z.uuid().nullable(),
});
export type SupportEvent = z.infer<typeof supportEventSchema>;

/** Someone who can work on reports, for the assignee picker. */
export const supportTeamMemberSchema = supportPersonSchema.extend({
  id: z.uuid(),
  roleLabel: z.string(),
  /** Reports and feedback assigned to them that are not done. */
  openReports: z.number().int().nonnegative(),
  openFeedback: z.number().int().nonnegative(),
});
export type SupportTeamMember = z.infer<typeof supportTeamMemberSchema>;

export const supportTeamResponseSchema = z.strictObject({
  members: z.array(supportTeamMemberSchema),
});
export type SupportTeamResponse = z.infer<typeof supportTeamResponseSchema>;

/** What only the team sees about a ticket. */
export const supportTicketStaffSchema = z.strictObject({
  assignee: supportPersonSchema.nullable(),
  assignedAt: z.string().nullable(),
  priority: supportPrioritySchema.nullable(),
  events: z.array(supportEventSchema),
  /** Whether the viewer may edit and delete any note, not only their own. */
  canModerateNotes: z.boolean(),
});
export type SupportTicketStaff = z.infer<typeof supportTicketStaffSchema>;

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
    assignee: supportPersonSchema.nullable(),
    priority: supportPrioritySchema.nullable(),
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
  /** For the team only; null for the learner. */
  staff: supportTicketStaffSchema.nullable(),
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
  /** "me", "none" (unassigned) or a team member's id. */
  assignee: z.union([z.enum(["me", "none"]), z.uuid()]).optional(),
  /** Leave out what is done (resolved reports). */
  active: z.stringbool().optional(),
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
    /** Not resolved and assigned to the viewer. */
    assignedToMe: z.number().int(),
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
    assignedToMe: z.number().int(),
  }),
});
export type SupportAdminStatsResponse = z.infer<
  typeof supportAdminStatsResponseSchema
>;

export const supportUnreadResponseSchema = z.strictObject({
  unread: z.number().int().nonnegative(),
});
export type SupportUnreadResponse = z.infer<typeof supportUnreadResponseSchema>;
