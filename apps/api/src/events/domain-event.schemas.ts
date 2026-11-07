import { z } from "zod";

export const coursePublishedEventSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  courseTitle: z.string().min(1).max(255),
  creatorUserId: z.uuid(),
});

export const paymentCompletedEventSchema = z.strictObject({
  paymentId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  totalAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  itemTitles: z.array(z.string().min(1).max(255)).min(1).max(100),
});

export const paymentFailedEventSchema = z.strictObject({
  paymentId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  reason: z.string().min(1).max(1000),
});

export const refundCompletedEventSchema = z.strictObject({
  refundId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
});

export const videoProcessingEventSchema = z.strictObject({
  mediaId: z.uuid(),
  recipientUserId: z.uuid(),
  filename: z.string().min(1).max(255),
  error: z.string().min(1).max(2000).optional(),
});

export const authMfaEnabledEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
});

export const authPasskeyAddedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  passkeyId: z.uuid(),
});

export const authSessionRevokedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  sessionId: z.uuid(),
});

export const authAccountDeactivatedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
});

/**
 * Where a discussion comment is, for the mention and reply emails. Optional:
 * events written before they were added are still delivered, as before.
 */
const discussionEmailContext = {
  lessonTitle: z.string().min(1).max(255).optional(),
  courseTitle: z.string().min(1).max(255).optional(),
  /** When the comment or reply was posted (ISO 8601). */
  occurredAt: z.string().min(1).max(40).optional(),
};

export const userMentionedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  context: z.string().min(1).max(1000),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
  ...discussionEmailContext,
  /** The mention is in a reply, not in the comment itself. */
  inReply: z.boolean().optional(),
});

export const certificateGeneratedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  certificateId: z.uuid(),
});

export const discussionReplyCreatedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  threadTitle: z.string().min(1).max(255),
  replySnippet: z.string().min(1).max(1000),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
  ...discussionEmailContext,
  /**
   * Whose comment was replied to: the recipient's own ("author"), or one
   * they follow ("follower").
   */
  recipientRole: z.enum(["author", "follower"]).optional(),
  /** The comment that was replied to, as the recipient will recognise it. */
  originalSnippet: z.string().min(1).max(1000).optional(),
});

export const discussionAnswerAcceptedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  threadTitle: z.string().min(1).max(255),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
});

export const moderationContentModeratedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  contentType: z.enum(["thread", "reply", "note"]),
  action: z.string().min(1).max(50),
  reason: z.string().max(1000).optional().nullable(),
});

export const moderationUserSuspendedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  scope: z.string().min(1).max(50),
  reason: z.string().min(1).max(1000),
  expiresAt: z.string().optional().nullable(),
});

export const moderationUserUnsuspendedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  reason: z.string().max(1000).optional().nullable(),
});

export const moderationReportResolvedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  targetType: z.string().min(1).max(50),
  status: z.string().min(1).max(50),
  actionTaken: z.string().max(500).optional().nullable(),
});

/** Support staff answered a learner's report or feedback. */
const internalDeepLink = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^\/(?!\/)/u, "Deep links must be internal application paths.");

/** Someone @mentioned the recipient in a chat group (in the app only). */
export const chatMentionedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  roomTitle: z.string().min(1).max(255),
  snippet: z.string().min(1).max(500),
  deepLink: internalDeepLink,
});

/** A learner was restricted across all chats by someone who is not a chat manager. */
export const chatPlatformRestrictionEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  targetName: z.string().min(1).max(255),
  restriction: z.enum(["mute", "ban", "no_direct"]),
  reason: z.string().min(1).max(40),
  deepLink: internalDeepLink,
});

export const supportReplyPostedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  ticketId: z.uuid(),
  ticketNumber: z.number().int(),
  ticketKind: z.enum(["problem", "feedback"]),
  replySnippet: z.string().max(300),
  /** False for feedback sent with "don't contact me": in the app only. */
  emailAllowed: z.boolean().optional(),
});

export const quizAttemptPassedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  courseSlug: z.string().min(1).max(160),
  quizId: z.uuid(),
  quizTitle: z.string().min(1).max(255),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
  scorePercentage: z.number().min(0).max(100),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
});

export const quizAttemptFailedFinalEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  courseSlug: z.string().min(1).max(160),
  quizId: z.uuid(),
  quizTitle: z.string().min(1).max(255),
  maxAttempts: z.number().int().positive(),
  scorePercentage: z.number().min(0).max(100),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
});

export const quizAssignedEventSchema = z.strictObject({
  courseId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  courseSlug: z.string().min(1).max(160),
  quizId: z.uuid(),
  quizTitle: z.string().min(1).max(255),
  lessonId: z.uuid(),
  lessonTitle: z.string().min(1).max(255),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
});

export const learningGoalCompletedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  dailyGoalMinutes: z.number().int().positive(),
  /** Learner-local calendar date (YYYY-MM-DD) the goal was completed on. */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});

export const learningStreakMilestoneEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  streakDays: z.number().int().positive(),
});

export const learningReminderEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  dailyGoalMinutes: z.number().int().positive(),
  /** Current streak that tonight's inactivity would break (0 = none). */
  streakDays: z.number().int().nonnegative(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});
