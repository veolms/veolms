import type {
  OrderConfirmation,
  NotificationCategory,
  NotificationChannel,
} from "@veolms/contracts";
import type { NotificationDeliveryLane } from "@veolms/database";
import type { EmailAttachment } from "@veolms/services/email";

export type NotificationTemplateKey =
  | "course.published"
  | "purchase.completed"
  | "payment.failed"
  | "refund.completed"
  | "video.processing_completed"
  | "video.processing_failed"
  | "auth.mfa_enabled"
  | "auth.passkey_added"
  | "auth.session_revoked"
  | "auth.account_deactivated"
  | "user.mentioned"
  | "certificate.generated"
  | "discussion.reply_created"
  | "discussion.answer_accepted"
  | "moderation.content_moderated"
  | "moderation.user_suspended"
  | "moderation.user_unsuspended"
  | "moderation.report_resolved"
  | "support.reply_posted"
  | "access.validity_extended"
  | "support.assigned"
  | "chat.mentioned"
  | "chat.platform_restriction"
  | "quiz.attempt_passed"
  | "quiz.attempt_failed_final"
  | "quiz.assigned"
  | "learning.goal_completed"
  | "learning.streak_milestone"
  | "learning.reminder"
  | "workshop.registered"
  | "workshop.reminder"
  | "workshop.recording_ready"
  | "workshop.updated"
  | "workshop.announced"
  | "email.unsubscribed"
  | "affiliate.application_received"
  | "affiliate.status_changed"
  | "affiliate.commission_earned"
  | "affiliate.commission_reversed"
  | "affiliate.payout_requested"
  | "affiliate.payout_decided";

/**
 * One bought item as the purchase email shows it (stored as JSON in the
 * notification's `purchaseItems`).
 */
export interface PurchaseItemTemplateData {
  title: string;
  kind: "course" | "workshop" | "none";
  courseKey?: string;
  workshopSlug?: string;
  startsAt?: string;
  timeZone?: string;
  welcomeMessage?: string;
  welcomeLinkLabel?: string;
  welcomeLinkUrl?: string;
}

export type NotificationTemplateData = Record<
  string,
  string | number | readonly string[]
>;

/**
 * A file to send with a notification's email, named by what it is rather
 * than carried as bytes: the queued email stays small, and the file is
 * fetched when the email goes out (see NotificationAttachmentResolver).
 */
export type NotificationEmailAttachment = {
  kind: "order-invoice";
  orderId: string;
};

export interface NotificationIntent {
  recipientUserId: string;
  type: string;
  category: NotificationCategory;
  templateKey: NotificationTemplateKey;
  templateData: NotificationTemplateData;
  channels: readonly NotificationChannel[];
  mandatory: boolean;
  deepLink: string | null;
  /** Files sent with the email, if it is sent. */
  emailAttachments?: readonly NotificationEmailAttachment[];
  /**
   * A workshop calendar invitation sent as part of the email: built for the
   * recipient when the email goes out.
   */
  emailCalendar?: { workshopId: string; method: "REQUEST" | "CANCEL" };
  /**
   * False keeps it off phones even when the type is pushed (a course-wide
   * event with NOTIFICATION_COURSE_WIDE_PUSH off). Which types are pushed at
   * all is PUSH_ROUTES in the contracts, not the handlers.
   */
  push?: boolean;
  /**
   * Which email queue it waits in. `bulk` for notices sent to everyone in a
   * course or to many people at once: they go out a few at a time behind
   * `transactional` mail, which one person's own action caused.
   */
  lane?: NotificationDeliveryLane;
}

/**
 * Turns an attachment reference into the file to send. Throws when the file
 * cannot be had right now; the email is then tried again later.
 */
/** Builds a workshop's calendar invitation for one recipient. */
export interface NotificationCalendarInviteBuilder {
  build(input: {
    workshopId: string;
    method: "REQUEST" | "CANCEL";
    attendeeEmail: string;
  }): Promise<{ method: "REQUEST" | "CANCEL"; content: string } | null>;
}

export interface NotificationAttachmentResolver {
  resolve(attachment: NotificationEmailAttachment): Promise<EmailAttachment>;
}

export interface NotificationHandlerDependencies {
  listActiveCourseRecipientUserIds(courseId: string): Promise<string[]>;
  /** False keeps course-wide notifications in-app only (no email). */
  courseWideEmail?: boolean;
  /** False keeps course-wide notifications off phones. */
  courseWidePush?: boolean;
  /** Everyone registered for a workshop, for its reminders. */
  listWorkshopRegistrantUserIds?(workshopId: string): Promise<string[]>;
  /** Every learner on the platform, for a workshop announced to everyone. */
  listAllLearnerUserIds?(): Promise<string[]>;
  /** Team members whose roles grant this permission across the platform. */
  listPermissionHolderUserIds?(permissionKey: string): Promise<string[]>;
  /**
   * The buyer's order page (what each item opens, the creator's welcome),
   * for the purchase email; see order-confirmation.service.
   */
  getPurchaseConfirmation?(
    userId: string,
    orderId: string,
  ): Promise<{ confirmation: OrderConfirmation; firstName: string } | null>;
}

/** A chat message to push, with who should get it (from the chat module). */
export interface ChatMessagePush {
  roomId: string;
  roomKind: "course" | "team" | "direct";
  /** The group's name; for a private chat, the sender's name. */
  roomTitle: string;
  messageId: string;
  seq: number;
  senderId: string;
  senderName: string;
  /**
   * Pictures for the Android notification: public, static PNG/JPEG/WebP
   * URLs, or null/absent for none. The sender's (for a reaction, the
   * reactor's) photo, and the group's picture (never for a private chat).
   */
  senderAvatarUrl?: string | null;
  roomIconUrl?: string | null;
  /** One line: the text, or what was attached ("Photo", "Voice message"). */
  text: string;
  sentAt: Date;
  /** A first message from someone not yet accepted. */
  isRequest: boolean;
  recipients: readonly {
    userId: string;
    isMention: boolean;
    /** Unread messages in this chat for them, capped at 99. */
    unreadCount: number;
  }[];
}

/**
 * Turns a `chat.message_sent` event into the message and its recipients,
 * applying the chat's own rules (muted chats, already read, blocks, large
 * groups). Null: nothing to push (deleted, system message, nobody left).
 */
export interface ChatPushSource {
  resolveMessagePush(payload: unknown): Promise<ChatMessagePush | null>;
}

export const CHAT_MESSAGE_SENT_EVENT = "chat.message_sent";

export interface NotificationRecipient {
  id: string;
  email: string | null;
  /**
   * Deactivated accounts are still resolved (the deactivation notice itself
   * must reach them) but receive nothing optional.
   */
  isDeleted?: boolean;
}

export interface NotificationRecipientDirectory {
  findRecipient(userId: string): Promise<NotificationRecipient | undefined>;
  /**
   * Optional bulk variant — fan-out events resolve every recipient of a
   * course; one-query-per-recipient dominates their processing time.
   * Implementations may return fewer rows than requested ids (unknown ids
   * are simply absent).
   */
  findRecipients?(userIds: readonly string[]): Promise<NotificationRecipient[]>;
}
