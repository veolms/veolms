/**
 * The notification types a user can switch off, grouped the way the settings
 * page presents them. Dependency-free: the web imports it from
 * `@veolms/contracts/notification-types` without pulling in zod.
 *
 * This list is the single source for both sides. The settings page used to
 * keep its own copy, which toggled names the server never sent
 * ("comment.replied", "qa.answered", "assignment.reminder") and omitted the
 * ones it did send — so turning off "Discussion replies" or all email
 * changed nothing. A type the server emits as non-mandatory MUST be listed
 * here (notification-types.test.ts in the API checks that).
 *
 * Mandatory notifications (security events, moderation actions against the
 * recipient) are deliberately absent: they cannot be turned off.
 */
export const OPTIONAL_NOTIFICATION_GROUPS = {
  courseUpdates: [
    "course.published",
    "video.processing_completed",
    "video.processing_failed",
  ],
  discussions: [
    "user.mentioned",
    "discussion.reply_created",
    "discussion.answer_accepted",
    "moderation.report_resolved",
  ],
  reminders: ["learning.reminder", "quiz.assigned"],
  achievements: [
    "certificate.generated",
    "learning.goal_completed",
    "learning.streak_milestone",
    "quiz.attempt.passed",
    "quiz.attempt.failed_final",
  ],
  purchases: ["purchase.completed", "payment.failed", "refund.completed"],
} as const;

export type OptionalNotificationGroup =
  keyof typeof OPTIONAL_NOTIFICATION_GROUPS;

export const OPTIONAL_NOTIFICATION_TYPES: readonly string[] = Object.values(
  OPTIONAL_NOTIFICATION_GROUPS,
).flat();

/**
 * Names the settings page saved before it shared this list, mapped to the
 * type they were meant to control. A stored opt-out under an old name still
 * applies to the real type, so nobody has to redo their settings.
 */
export const LEGACY_NOTIFICATION_TYPE_ALIASES: Readonly<
  Record<string, string>
> = {
  "discussion.reply_created": "comment.replied",
  "discussion.answer_accepted": "qa.answered",
  "quiz.assigned": "assignment.reminder",
};

/** Every type name a preference may be stored under. */
export function isKnownNotificationPreferenceType(type: string): boolean {
  return (
    OPTIONAL_NOTIFICATION_TYPES.includes(type) ||
    Object.values(LEGACY_NOTIFICATION_TYPE_ALIASES).includes(type)
  );
}
