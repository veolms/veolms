import type {
  NotificationCategory,
  NotificationChannel,
} from "@veolms/contracts";

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
  | "certificate.generated";

export type NotificationTemplateData = Record<
  string,
  string | number | readonly string[]
>;

export interface NotificationIntent {
  recipientUserId: string;
  type: string;
  category: NotificationCategory;
  templateKey: NotificationTemplateKey;
  templateData: NotificationTemplateData;
  channels: readonly NotificationChannel[];
  mandatory: boolean;
  deepLink: string | null;
}

export interface NotificationHandlerDependencies {
  listActiveCourseRecipientUserIds(courseId: string): Promise<string[]>;
}

export interface NotificationRecipient {
  id: string;
  email: string | null;
}

export interface NotificationRecipientDirectory {
  findRecipient(userId: string): Promise<NotificationRecipient | undefined>;
}
