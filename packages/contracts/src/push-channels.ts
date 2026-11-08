/**
 * Android notification channels and how each notification type is pushed.
 * Dependency-free so the apps can import it without zod.
 *
 * The Android app creates every channel below at each start (creating an
 * existing channel changes nothing). A channel's importance can never
 * change once created: to change it, add a new id (`mentions_v2`) and
 * delete the old one in the app. Names and descriptions may change.
 *
 * Android 8+ uses the channel's importance; Android 7.x ignores channels
 * and uses the per-message priority, so every push carries both.
 */

export type AndroidChannelImportance = "HIGH" | "DEFAULT" | "LOW" | "MIN";

export interface AndroidChannelGroup {
  id: string;
  name: string;
}

export interface AndroidNotificationChannel {
  id: string;
  name: string;
  description: string;
  /** null = no group (the fallback channel). */
  group: string | null;
  importance: AndroidChannelImportance;
}

export const ANDROID_NOTIFICATION_CHANNEL_GROUPS: readonly AndroidChannelGroup[] =
  [
    { id: "chats", name: "Chats" },
    { id: "learning", name: "Learning" },
    { id: "community", name: "Community" },
    { id: "account", name: "Account" },
    { id: "teaching", name: "Teaching" },
  ];

/** The app's manifest default: anything without a known channel lands here. */
export const ANDROID_FALLBACK_CHANNEL_ID = "general";

export const ANDROID_NOTIFICATION_CHANNELS: readonly AndroidNotificationChannel[] =
  [
    {
      id: "chat_messages",
      name: "Chat messages",
      description: "New messages in your chats and groups",
      group: "chats",
      importance: "HIGH",
    },
    {
      id: "course_updates",
      name: "Course updates",
      description: "New courses and course changes",
      group: "learning",
      importance: "DEFAULT",
    },
    {
      id: "study_reminders",
      name: "Study reminders",
      description: "Daily study reminders and assigned quizzes",
      group: "learning",
      importance: "DEFAULT",
    },
    {
      id: "achievements",
      name: "Achievements",
      description: "Certificates, streaks, goals and quiz results",
      group: "learning",
      importance: "LOW",
    },
    {
      id: "mentions",
      name: "Mentions",
      description: "Someone mentioned you in a discussion",
      group: "community",
      importance: "HIGH",
    },
    {
      id: "discussion_replies",
      name: "Discussion replies",
      description: "Replies to your questions and accepted answers",
      group: "community",
      importance: "DEFAULT",
    },
    {
      id: "moderation_updates",
      name: "Moderation",
      description: "Reports you made and actions on your content",
      group: "community",
      importance: "DEFAULT",
    },
    {
      id: "purchases",
      name: "Purchases and payments",
      description: "Orders, failed payments and refunds",
      group: "account",
      importance: "DEFAULT",
    },
    {
      id: "support_replies",
      name: "Support replies",
      description: "Answers to your support requests",
      group: "account",
      importance: "DEFAULT",
    },
    {
      id: "account_security",
      name: "Account and security",
      description: "Sign-in and security changes on your account",
      group: "account",
      importance: "HIGH",
    },
    {
      id: "video_processing",
      name: "Video processing",
      description: "Your uploaded videos are ready or failed",
      group: "teaching",
      importance: "LOW",
    },
    {
      id: ANDROID_FALLBACK_CHANNEL_ID,
      name: "General",
      description: "Other notifications",
      group: null,
      importance: "DEFAULT",
    },
  ];

/** Android 7.x priority for each importance (sent as `notification_priority`). */
export const ANDROID_PRIORITY_FOR_IMPORTANCE: Readonly<
  Record<AndroidChannelImportance, string>
> = {
  HIGH: "PRIORITY_HIGH",
  DEFAULT: "PRIORITY_DEFAULT",
  LOW: "PRIORITY_LOW",
  MIN: "PRIORITY_MIN",
};

export interface PushRoute {
  androidChannelId: string;
  /** How long Firebase keeps it for an offline phone; also our own expiry. */
  ttlSeconds: number;
  /** Phones offline meanwhile show only the latest of this kind. */
  collapse: boolean;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * Which notification types are pushed, and how. A type missing here is
 * never pushed. `chat.mentioned` is absent on purpose: the chat message
 * push already tells the person they were mentioned.
 */
export const PUSH_ROUTES: Readonly<Record<string, PushRoute>> = {
  "chat.message": {
    androidChannelId: "chat_messages",
    ttlSeconds: 2 * DAY,
    collapse: false,
  },
  "course.published": {
    androidChannelId: "course_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "quiz.assigned": {
    androidChannelId: "study_reminders",
    ttlSeconds: 3 * DAY,
    collapse: false,
  },
  "learning.reminder": {
    androidChannelId: "study_reminders",
    ttlSeconds: DAY,
    collapse: true,
  },
  "certificate.generated": {
    androidChannelId: "achievements",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "learning.goal_completed": {
    androidChannelId: "achievements",
    ttlSeconds: DAY,
    collapse: true,
  },
  "learning.streak_milestone": {
    androidChannelId: "achievements",
    ttlSeconds: DAY,
    collapse: true,
  },
  "quiz.attempt.passed": {
    androidChannelId: "achievements",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "quiz.attempt.failed_final": {
    androidChannelId: "achievements",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "user.mentioned": {
    androidChannelId: "mentions",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "discussion.reply_created": {
    androidChannelId: "discussion_replies",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "discussion.answer_accepted": {
    androidChannelId: "discussion_replies",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "moderation.report_resolved": {
    androidChannelId: "moderation_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "moderation.content_moderated": {
    androidChannelId: "moderation_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "moderation.user_suspended": {
    androidChannelId: "moderation_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "moderation.user_unsuspended": {
    androidChannelId: "moderation_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "chat.platform_restriction": {
    androidChannelId: "moderation_updates",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "purchase.completed": {
    androidChannelId: "purchases",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "payment.failed": {
    androidChannelId: "purchases",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "refund.completed": {
    androidChannelId: "purchases",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "support.reply_posted": {
    androidChannelId: "support_replies",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "auth.mfa_enabled": {
    androidChannelId: "account_security",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "auth.passkey_added": {
    androidChannelId: "account_security",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "auth.session_revoked": {
    androidChannelId: "account_security",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "auth.account_deactivated": {
    androidChannelId: "account_security",
    ttlSeconds: 7 * DAY,
    collapse: false,
  },
  "video.processing_completed": {
    androidChannelId: "video_processing",
    ttlSeconds: 2 * DAY,
    collapse: false,
  },
  "video.processing_failed": {
    androidChannelId: "video_processing",
    ttlSeconds: 2 * DAY,
    collapse: false,
  },
};

export function pushRouteFor(type: string): PushRoute | undefined {
  return PUSH_ROUTES[type];
}

export function androidChannel(
  id: string,
): AndroidNotificationChannel | undefined {
  return ANDROID_NOTIFICATION_CHANNELS.find((channel) => channel.id === id);
}
