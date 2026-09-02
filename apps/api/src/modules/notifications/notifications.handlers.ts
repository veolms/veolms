import {
  authMfaEnabledEventSchema,
  authAccountDeactivatedEventSchema,
  authPasskeyAddedEventSchema,
  authSessionRevokedEventSchema,
  certificateGeneratedEventSchema,
  coursePublishedEventSchema,
  paymentCompletedEventSchema,
  paymentFailedEventSchema,
  refundCompletedEventSchema,
  userMentionedEventSchema,
  videoProcessingEventSchema,
} from "../../events/domain-event.schemas.ts";
import type { Json } from "@veolms/database";

import type {
  NotificationHandlerDependencies,
  NotificationIntent,
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
      channels: commonChannels,
      mandatory: false,
      deepLink: `/courses/${event.courseSlug}`,
    }));
  },
  "payment.completed": async (payload) => {
    const event = paymentCompletedEventSchema.parse(payload);
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
        },
        channels: commonChannels,
        mandatory: false,
        deepLink: "/orders",
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
        templateData: { actorName: event.actorName, context: event.context },
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
};

export async function createNotificationIntents(
  eventType: string,
  payload: Json,
  dependencies: NotificationHandlerDependencies,
): Promise<NotificationIntent[]> {
  const handler = notificationHandlers[eventType];
  if (!handler) throw new UnknownNotificationEventError(eventType);
  return await handler(payload, dependencies);
}

export const registeredNotificationEventTypes = Object.freeze(
  Object.keys(notificationHandlers),
);
