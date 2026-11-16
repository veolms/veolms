import {
  authMfaEnabledEventSchema,
  authAccountDeactivatedEventSchema,
  authPasskeyAddedEventSchema,
  authSessionRevokedEventSchema,
  certificateGeneratedEventSchema,
  chatMentionedEventSchema,
  chatPlatformRestrictionEventSchema,
  coursePublishedEventSchema,
  discussionAnswerAcceptedEventSchema,
  discussionReplyCreatedEventSchema,
  learningGoalCompletedEventSchema,
  learningReminderEventSchema,
  learningStreakMilestoneEventSchema,
  moderationContentModeratedEventSchema,
  moderationReportResolvedEventSchema,
  supportAssignedEventSchema,
  supportReplyPostedEventSchema,
  accessValidityExtendedEventSchema,
  moderationUserSuspendedEventSchema,
  moderationUserUnsuspendedEventSchema,
  paymentCompletedEventSchema,
  paymentFailedEventSchema,
  quizAssignedEventSchema,
  quizAttemptFailedFinalEventSchema,
  quizAttemptPassedEventSchema,
  refundCompletedEventSchema,
  userMentionedEventSchema,
  videoProcessingEventSchema,
  workshopRegisteredEventSchema,
  workshopReminderEventSchema,
  workshopRecordingReadyEventSchema,
  workshopUpdatedEventSchema,
  workshopAnnouncedEventSchema,
  emailUnsubscribedEventSchema,
} from "../../events/domain-event.schemas.ts";
import type { OrderConfirmationItem } from "@veolms/contracts";
import type { Json } from "@veolms/database";

import type {
  NotificationHandlerDependencies,
  NotificationIntent,
  PurchaseItemTemplateData,
} from "./notifications.types.ts";

export class UnknownNotificationEventError extends Error {
  constructor(eventType: string) {
    super(`No notification handler is registered for event "${eventType}".`);
    this.name = "UnknownNotificationEventError";
  }
}

type NotificationHandler = (
  payload: Json,
  dependencies: NotificationHandlerDependencies,
) => Promise<NotificationIntent[]>;

const commonChannels = ["in_app", "email"] as const;

/** What the purchase email needs of one item on the order page. */
function purchaseEmailItem(
  item: OrderConfirmationItem,
): PurchaseItemTemplateData {
  const welcome = item.welcome;
  return {
    title: item.title,
    kind: item.next.kind,
    ...(item.next.kind === "course" ? { courseKey: item.next.courseKey } : {}),
    ...(item.next.kind === "workshop"
      ? {
          workshopSlug: item.next.workshopSlug,
          ...(item.next.nextSession
            ? {
                startsAt: item.next.nextSession.startsAt,
                timeZone: item.next.nextSession.timeZone,
              }
            : {}),
        }
      : {}),
    ...(welcome?.message ? { welcomeMessage: welcome.message } : {}),
    ...(welcome?.link
      ? {
          welcomeLinkLabel: welcome.link.label,
          welcomeLinkUrl: welcome.link.url,
        }
      : {}),
  };
}

// Notifications sent to everyone in a course can be kept off email
// (NOTIFICATION_COURSE_WIDE_EMAIL), so one event cannot mail thousands at once.
function courseWideChannels(dependencies: NotificationHandlerDependencies) {
  return dependencies.courseWideEmail === false
    ? (["in_app"] as const)
    : commonChannels;
}

/**
 * The lecture, course and time a discussion email shows, where the event
 * has them (events from before they were added do not).
 */
function discussionEmailData(event: {
  lessonTitle?: string | undefined;
  courseTitle?: string | undefined;
  occurredAt?: string | undefined;
}): Record<string, string> {
  const data: Record<string, string> = {};
  if (event.lessonTitle) data.lessonTitle = event.lessonTitle;
  if (event.courseTitle) data.courseTitle = event.courseTitle;
  if (event.occurredAt) data.occurredAt = event.occurredAt;
  return data;
}

const notificationHandlers: Record<string, NotificationHandler> = {
  "course.published": async (payload, dependencies) => {
    const event = coursePublishedEventSchema.parse(payload);
    const recipientUserIds =
      await dependencies.listActiveCourseRecipientUserIds(event.courseId);
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "course.published",
      category: "learning",
      templateKey: "course.published",
      templateData: { courseTitle: event.courseTitle },
      channels: courseWideChannels(dependencies),
      push: dependencies.courseWidePush !== false,
      lane: "bulk",
      mandatory: false,
      deepLink: `/courses/${event.courseSlug}`,
    }));
  },
  "payment.completed": async (payload, dependencies) => {
    const event = paymentCompletedEventSchema.parse(payload);
    // What each item opens and the creator's welcome, for the email. A
    // lookup that fails still sends the plain receipt.
    const purchase = await dependencies
      .getPurchaseConfirmation?.(event.recipientUserId, event.orderId)
      .catch(() => null);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "purchase.completed",
        category: "transactional",
        templateKey: "purchase.completed",
        templateData: {
          orderNumber: event.orderNumber,
          totalAmount: event.totalAmount,
          currency: event.currency,
          itemTitles: event.itemTitles,
          orderId: event.orderId,
          ...(purchase
            ? {
                firstName: purchase.firstName,
                purchaseItems: JSON.stringify(
                  purchase.confirmation.items.map(purchaseEmailItem),
                ),
              }
            : {}),
        },
        channels: commonChannels,
        mandatory: false,
        // The buyer's order page: what to open next, the receipt, invoice.
        deepLink: `/purchase-history/${event.orderId}`,
        // The purchase email carries the order's invoice.
        emailAttachments: [{ kind: "order-invoice", orderId: event.orderId }],
      },
    ];
  },
  "payment.failed": async (payload) => {
    const event = paymentFailedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "payment.failed",
        category: "transactional",
        templateKey: "payment.failed",
        templateData: {
          orderNumber: event.orderNumber,
          reason: event.reason,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/orders",
      },
    ];
  },
  "refund.completed": async (payload) => {
    const event = refundCompletedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "refund.completed",
        category: "transactional",
        templateKey: "refund.completed",
        templateData: {
          orderNumber: event.orderNumber,
          amount: event.amount,
          currency: event.currency,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/orders",
      },
    ];
  },
  "video.processing_completed": async (payload) => {
    const event = videoProcessingEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "video.processing_completed",
        category: "system",
        templateKey: "video.processing_completed",
        templateData: { filename: event.filename },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/courses",
      },
    ];
  },
  "video.processing_failed": async (payload) => {
    const event = videoProcessingEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "video.processing_failed",
        category: "system",
        templateKey: "video.processing_failed",
        templateData: {
          filename: event.filename,
          error: event.error ?? "Please try again.",
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/courses",
      },
    ];
  },
  "auth.mfa_enabled": async (payload) => {
    const event = authMfaEnabledEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "auth.mfa_enabled",
        category: "system",
        templateKey: "auth.mfa_enabled",
        templateData: {},
        channels: commonChannels,
        mandatory: true,
        deepLink: "/settings/security",
      },
    ];
  },
  "auth.passkey_added": async (payload) => {
    const event = authPasskeyAddedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "auth.passkey_added",
        category: "system",
        templateKey: "auth.passkey_added",
        templateData: {},
        channels: commonChannels,
        mandatory: true,
        deepLink: "/settings/security",
      },
    ];
  },
  "auth.session_revoked": async (payload) => {
    const event = authSessionRevokedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "auth.session_revoked",
        category: "system",
        templateKey: "auth.session_revoked",
        templateData: {},
        channels: commonChannels,
        mandatory: true,
        deepLink: "/settings/security",
      },
    ];
  },
  "auth.account_deactivated": async (payload) => {
    const event = authAccountDeactivatedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "auth.account_deactivated",
        category: "system",
        templateKey: "auth.account_deactivated",
        templateData: {},
        channels: ["email"],
        mandatory: true,
        deepLink: null,
      },
    ];
  },
  "user.mentioned": async (payload) => {
    const event = userMentionedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "user.mentioned",
        category: "social",
        templateKey: "user.mentioned",
        templateData: {
          actorName: event.actorName,
          context: event.context,
          ...discussionEmailData(event),
          ...(event.inReply ? { inReply: "true" } : {}),
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "certificate.generated": async (payload) => {
    const event = certificateGeneratedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "certificate.generated",
        category: "learning",
        templateKey: "certificate.generated",
        templateData: { courseTitle: event.courseTitle },
        channels: commonChannels,
        mandatory: false,
        deepLink: `/certificates/${event.certificateId}`,
      },
    ];
  },
  "discussion.reply_created": async (payload) => {
    const event = discussionReplyCreatedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "discussion.reply_created",
        category: "social",
        templateKey: "discussion.reply_created",
        templateData: {
          actorName: event.actorName,
          threadTitle: event.threadTitle,
          replySnippet: event.replySnippet,
          ...discussionEmailData(event),
          ...(event.recipientRole
            ? { recipientRole: event.recipientRole }
            : {}),
          ...(event.originalSnippet
            ? { originalSnippet: event.originalSnippet }
            : {}),
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "discussion.answer_accepted": async (payload) => {
    const event = discussionAnswerAcceptedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "discussion.answer_accepted",
        category: "social",
        templateKey: "discussion.answer_accepted",
        templateData: {
          actorName: event.actorName,
          threadTitle: event.threadTitle,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "moderation.content_moderated": async (payload) => {
    const event = moderationContentModeratedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "moderation.content_moderated",
        category: "system",
        templateKey: "moderation.content_moderated",
        templateData: {
          contentType: event.contentType,
          action: event.action,
          ...(event.reason ? { reason: event.reason } : {}),
        },
        channels: commonChannels,
        mandatory: true,
        deepLink: "/discussions",
      },
    ];
  },
  "moderation.user_suspended": async (payload) => {
    const event = moderationUserSuspendedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "moderation.user_suspended",
        category: "system",
        templateKey: "moderation.user_suspended",
        templateData: {
          scope: event.scope,
          reason: event.reason,
          ...(event.expiresAt ? { expiresAt: event.expiresAt } : {}),
        },
        channels: commonChannels,
        mandatory: true,
        deepLink: "/discussions",
      },
    ];
  },
  "moderation.user_unsuspended": async (payload) => {
    const event = moderationUserUnsuspendedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "moderation.user_unsuspended",
        category: "system",
        templateKey: "moderation.user_unsuspended",
        templateData: {
          ...(event.reason ? { reason: event.reason } : {}),
        },
        channels: commonChannels,
        mandatory: true,
        deepLink: "/discussions",
      },
    ];
  },
  "moderation.report_resolved": async (payload) => {
    const event = moderationReportResolvedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "moderation.report_resolved",
        category: "system",
        templateKey: "moderation.report_resolved",
        templateData: {
          targetType: event.targetType,
          status: event.status,
          ...(event.actionTaken ? { actionTaken: event.actionTaken } : {}),
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/discussions",
      },
    ];
  },
  "chat.mentioned": async (payload) => {
    const event = chatMentionedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "chat.mentioned",
        category: "social",
        templateKey: "chat.mentioned",
        templateData: {
          actorName: event.actorName,
          roomTitle: event.roomTitle,
          snippet: event.snippet,
        },
        // Chat is live already; email for every mention would be noise.
        channels: ["in_app"] as const,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "chat.platform_restriction": async (payload) => {
    const event = chatPlatformRestrictionEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "chat.platform_restriction",
        category: "transactional",
        templateKey: "chat.platform_restriction",
        templateData: {
          actorName: event.actorName,
          targetName: event.targetName,
          restriction: event.restriction,
          reason: event.reason,
        },
        channels: ["in_app"] as const,
        // A staff alert (decision 5), not a preference.
        mandatory: true,
        deepLink: event.deepLink,
      },
    ];
  },
  "support.reply_posted": async (payload) => {
    const event = supportReplyPostedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "support.reply_posted",
        category: "transactional",
        templateKey: "support.reply_posted",
        templateData: {
          ticketNumber: String(event.ticketNumber),
          ticketKind: event.ticketKind,
          replySnippet: event.replySnippet,
        },
        channels:
          event.emailAllowed === false ? (["in_app"] as const) : commonChannels,
        // An answer to something the learner asked us; not a preference.
        mandatory: true,
        deepLink: `/support/${event.ticketId}`,
      },
    ];
  },
  "access.validity_extended": async (payload) => {
    const event = accessValidityExtendedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "access.validity_extended",
        category: "transactional",
        templateKey: "access.validity_extended",
        templateData: {
          courseTitle: event.courseTitle,
          // Written out here: the email has no other way to show a date.
          validUntil: event.validUntil
            ? new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              }).format(new Date(event.validUntil))
            : "",
        },
        channels: commonChannels,
        // About the learner's own purchase; not a preference.
        mandatory: true,
        deepLink: `/courses/${event.courseSlug}/overview`,
      },
    ];
  },
  "support.assigned": async (payload) => {
    const event = supportAssignedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "support.assigned",
        category: "transactional",
        templateKey: "support.assigned",
        templateData: {
          ticketNumber: String(event.ticketNumber),
          ticketKind: event.ticketKind,
          ticketTitle: event.ticketTitle,
          assignedByName: event.assignedByName,
        },
        channels: commonChannels,
        // Work handed to a team member; not a preference.
        mandatory: true,
        deepLink:
          event.ticketKind === "feedback"
            ? `/support-inbox/feedback?ticket=${event.ticketId}`
            : `/support-inbox?ticket=${event.ticketId}`,
      },
    ];
  },
  "quiz.attempt.passed": async (payload) => {
    const event = quizAttemptPassedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "quiz.attempt.passed",
        category: "learning",
        templateKey: "quiz.attempt_passed",
        templateData: {
          courseTitle: event.courseTitle,
          quizTitle: event.quizTitle,
          scorePercentage: event.scorePercentage,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "quiz.attempt.failed_final": async (payload) => {
    const event = quizAttemptFailedFinalEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "quiz.attempt.failed_final",
        category: "learning",
        templateKey: "quiz.attempt_failed_final",
        templateData: {
          courseTitle: event.courseTitle,
          quizTitle: event.quizTitle,
          maxAttempts: event.maxAttempts,
          scorePercentage: event.scorePercentage,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: event.deepLink,
      },
    ];
  },
  "quiz.assigned": async (payload, dependencies) => {
    const event = quizAssignedEventSchema.parse(payload);
    const recipientUserIds =
      await dependencies.listActiveCourseRecipientUserIds(event.courseId);
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "quiz.assigned",
      category: "learning",
      templateKey: "quiz.assigned",
      templateData: {
        courseTitle: event.courseTitle,
        quizTitle: event.quizTitle,
        lessonTitle: event.lessonTitle,
      },
      channels: courseWideChannels(dependencies),
      push: dependencies.courseWidePush !== false,
      lane: "bulk",
      mandatory: false,
      deepLink: event.deepLink,
    }));
  },
  "learning.goal_completed": async (payload) => {
    const event = learningGoalCompletedEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "learning.goal_completed",
        category: "learning",
        templateKey: "learning.goal_completed",
        templateData: { goalLabel: formatGoalLabel(event.dailyGoalMinutes) },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/",
      },
    ];
  },
  "workshop.registered": async (payload) => {
    const event = workshopRegisteredEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "workshop.registered",
        category: "learning",
        templateKey: "workshop.registered",
        templateData: {
          workshopTitle: event.workshopTitle,
          workshopSlug: event.workshopSlug,
          startsAt: event.startsAt ?? "",
          endsAt: event.endsAt ?? "",
          timeZone: event.timeZone ?? "",
          sessionCount: event.sessionCount,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: `/workshops/${event.workshopSlug}`,
        emailCalendar: { workshopId: event.workshopId, method: "REQUEST" },
      },
    ];
  },
  "workshop.reminder": async (payload, dependencies) => {
    const event = workshopReminderEventSchema.parse(payload);
    const recipientUserIds =
      (await dependencies.listWorkshopRegistrantUserIds?.(event.workshopId)) ??
      [];
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "workshop.reminder",
      category: "learning",
      templateKey: "workshop.reminder",
      templateData: {
        workshopTitle: event.workshopTitle,
        workshopSlug: event.workshopSlug,
        sessionTitle: event.sessionTitle ?? "",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timeZone: event.timeZone,
        window: event.window,
      },
      channels:
        event.audience === "everyone" ? (["in_app"] as const) : commonChannels,
      mandatory: false,
      deepLink: `/workshops/${event.workshopSlug}`,
      // One notice to many learners: after sign-in codes and receipts.
      lane: "bulk" as const,
    }));
  },
  "workshop.recording_ready": async (payload, dependencies) => {
    const event = workshopRecordingReadyEventSchema.parse(payload);
    const recipientUserIds =
      (await dependencies.listWorkshopRegistrantUserIds?.(event.workshopId)) ??
      [];
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "workshop.recording_ready",
      category: "learning",
      templateKey: "workshop.recording_ready",
      templateData: {
        workshopTitle: event.workshopTitle,
        workshopSlug: event.workshopSlug,
        sessionTitle: event.sessionTitle ?? "",
      },
      channels: commonChannels,
      mandatory: false,
      deepLink: event.lessonPath ?? `/workshops/${event.workshopSlug}`,
      // One notice to many learners: after sign-in codes and receipts.
      lane: "bulk" as const,
    }));
  },
  "workshop.updated": async (payload, dependencies) => {
    const event = workshopUpdatedEventSchema.parse(payload);
    const recipientUserIds =
      (await dependencies.listWorkshopRegistrantUserIds?.(event.workshopId)) ??
      [];
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "workshop.updated",
      category: "learning",
      templateKey: "workshop.updated",
      templateData: {
        workshopTitle: event.workshopTitle,
        workshopSlug: event.workshopSlug,
        change: event.change,
        reason: event.reason ?? "",
        refunding: event.refunding ? "yes" : "",
        startsAt: event.startsAt ?? "",
        endsAt: event.endsAt ?? "",
        timeZone: event.timeZone ?? "",
      },
      channels: commonChannels,
      // A cancellation or a new time is about something they signed up for.
      mandatory: true,
      emailCalendar: {
        workshopId: event.workshopId,
        method: event.change === "cancelled" ? "CANCEL" : "REQUEST",
      } as const,
      deepLink: `/workshops/${event.workshopSlug}`,
      // One notice to many learners: after sign-in codes and receipts.
      lane: "bulk" as const,
    }));
  },
  "workshop.announced": async (payload, dependencies) => {
    const event = workshopAnnouncedEventSchema.parse(payload);
    const recipientUserIds =
      event.audience === "all"
        ? ((await dependencies.listAllLearnerUserIds?.()) ?? [])
        : ((await dependencies.listWorkshopRegistrantUserIds?.(
            event.workshopId,
          )) ?? []);
    return recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type: "workshop.announced",
      category: "learning",
      templateKey: "workshop.announced",
      templateData: {
        workshopTitle: event.workshopTitle,
        workshopSlug: event.workshopSlug,
        audience: event.audience,
        courseTitle: event.courseTitle ?? "",
        free: event.priceMinor ? "" : "yes",
        startsAt: event.startsAt ?? "",
        endsAt: event.endsAt ?? "",
        timeZone: event.timeZone ?? "",
      },
      channels: commonChannels,
      mandatory: false,
      ...(event.audience === "course" || !event.priceMinor
        ? {
            emailCalendar: {
              workshopId: event.workshopId,
              method: "REQUEST" as const,
            },
          }
        : {}),
      deepLink: `/workshops/${event.workshopSlug}`,
      // One notice to many learners: after sign-in codes and receipts.
      lane: "bulk" as const,
    }));
  },
  "email.unsubscribed": async (payload, dependencies) => {
    const event = emailUnsubscribedEventSchema.parse(payload);
    // Workshop emails are the workshop team's to know about; any other
    // group goes to whoever looks after learners.
    const permission =
      event.group === "workshops" ? "workshop.manage" : "student.read";
    const recipientUserIds =
      (await dependencies.listPermissionHolderUserIds?.(permission)) ?? [];
    return recipientUserIds
      .filter((recipientUserId) => recipientUserId !== event.userId)
      .map((recipientUserId) => ({
        recipientUserId,
        type: "email.unsubscribed",
        category: "system" as const,
        templateKey: "email.unsubscribed" as const,
        templateData: {
          name: event.name,
          email: event.email ?? "",
          groupLabel: event.groupLabel,
        },
        // A note for the team, not mail: in the app only.
        channels: ["in_app"] as const,
        mandatory: true,
        deepLink: event.username
          ? `/students/${encodeURIComponent(event.username)}`
          : "/students",
      }));
  },
  "learning.reminder": async (payload) => {
    const event = learningReminderEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "learning.reminder",
        category: "learning",
        templateKey: "learning.reminder",
        templateData: {
          goalLabel: formatGoalLabel(event.dailyGoalMinutes),
          streakDays: event.streakDays,
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/",
        lane: "bulk",
      },
    ];
  },
  "learning.streak_milestone": async (payload) => {
    const event = learningStreakMilestoneEventSchema.parse(payload);
    return [
      {
        recipientUserId: event.recipientUserId,
        type: "learning.streak_milestone",
        category: "learning",
        templateKey: "learning.streak_milestone",
        templateData: { streakDays: event.streakDays },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/",
      },
    ];
  },
};

function formatGoalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}-minute`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}

export async function createNotificationIntents(
  eventType: string,
  payload: Json,
  dependencies: NotificationHandlerDependencies,
): Promise<NotificationIntent[]> {
  // Team events are kept for the audit trail; the team module emails the
  // people concerned itself, so they raise no notifications.
  if (eventType.startsWith("team.")) return [];
  const handler = notificationHandlers[eventType];
  if (!handler) throw new UnknownNotificationEventError(eventType);
  return await handler(payload, dependencies);
}

export const registeredNotificationEventTypes = Object.freeze(
  Object.keys(notificationHandlers),
);
