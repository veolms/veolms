import type { Kysely, Transaction } from "kysely";

// Re-export all domain schema types
export * from "./auth.schema.ts";
export * from "./authorization.schema.ts";
export * from "./courses.schema.ts";
export * from "./chapters.schema.ts";
export * from "./subtitles.schema.ts";
export * from "./media.schema.ts";
export * from "./commerce.schema.ts";
export * from "./learning-interactions.schema.ts";
export * from "./webhooks.schema.ts";
export * from "./notifications.schema.ts";
export * from "./json.schema.ts";
export * from "./quizzes.schema.ts";
export * from "./learning-goals.schema.ts";
export * from "./home-page.schema.ts";
export * from "./quotes.schema.ts";
export * from "./wishlist.schema.ts";
export * from "./learning-progress.schema.ts";

// Import table interfaces to assemble unified Database schema
import type {
  AcademyTable,
  UserTable,
  UserRoleTable,
  MenuTable,
  MenuPermissionTable,
  SessionTable,
  PendingDeviceSignInTable,
  OauthAccountTable,
  OtpCodeTable,
  PasskeyTable,
  UserTotpCredentialTable,
  MfaBackupCodeTable,
  WebauthnChallengeTable,
  UserAvatarTable,
} from "./auth.schema.ts";

import type {
  PermissionTable,
  RoleTable,
  RolePermissionTable,
  RoleAssignmentTable,
  FeatureTable,
  TeamInvitationTable,
  TeamInvitationRoleTable,
} from "./authorization.schema.ts";

import type {
  CourseTable,
  CategoryTable,
  CourseSectionTable,
  CourseLessonTable,
  LessonResourceTable,
  CourseAccessRuleTable,
  CoursePricingTable,
  CourseSettingsTable,
  CourseIncludeTable,
  CourseLinkTable,
  CourseDeletionJobTable,
  CourseDeletionStorageItemTable,
} from "./courses.schema.ts";
import type { LessonChapterTable } from "./chapters.schema.ts";
import type { LessonSubtitleTable } from "./subtitles.schema.ts";
import type {
  ImageJobTable,
  MediaAssetTable,
  MediaSourceTable,
  VideoJobTable,
  VideoOutputTable,
  YoutubeImportJobTable,
} from "./media.schema.ts";

import type {
  CourseBundleTable,
  CourseBundleItemTable,
  CartTable,
  CartItemTable,
  CouponTable,
  CouponRedemptionTable,
  OrderTable,
  InvoiceNumberCounterTable,
  OrderItemTable,
  OrderItemCourseTable,
  PaymentTable,
  PaymentAttemptTable,
  RefundTable,
  AccessGrantTable,
  EnrollmentTable,
  CreatorPaymentConfigTable,
  RefundRequestTable,
  ManualPaymentRequestTable,
  CreditNoteTable,
} from "./commerce.schema.ts";

import type {
  LearningThreadTable,
  LearningReplyTable,
  LearningLikeTable,
  LearningBookmarkTable,
  LearningFollowTable,
  LearningMentionTable,
  LearningNoteTable,
  LearningAttachmentTable,
  LearningReportTable,
  LearningSuspensionTable,
  LearningAuditLogTable,
} from "./learning-interactions.schema.ts";

import type {
  WebhookEventTable,
  CallbackInboxTable,
  OutboxEventTable,
} from "./webhooks.schema.ts";
import type {
  NotificationTable,
  NotificationDeliveryTable,
  NotificationPreferenceTable,
} from "./notifications.schema.ts";

import type {
  QuizTable,
  QuizVersionTable,
  QuizQuestionTable,
  QuizQuestionOptionTable,
  QuizAssignmentTable,
  CourseQuizPricingTable,
  CourseQuizAccessGrantTable,
  QuizAttemptTable,
  QuizAttemptAnswerTable,
} from "./quizzes.schema.ts";
import type {
  LearningDailyActivityTable,
  LearningDailyCourseActivityTable,
  UserLearningSettingsTable,
} from "./learning-goals.schema.ts";
import type { HomePageSettingsTable } from "./home-page.schema.ts";
import type { PlatformSettingsTable } from "./platform-settings.schema.ts";
import type { QuoteTable } from "./quotes.schema.ts";
import type { WishlistItemTable } from "./wishlist.schema.ts";
import type { LearningProgressTable } from "./learning-progress.schema.ts";

export interface Database {
  // Auth & Roles
  academy: AcademyTable;
  users: UserTable;
  roles: RoleTable;
  user_roles: UserRoleTable;
  menus: MenuTable;
  menu_permissions: MenuPermissionTable;
  permissions: PermissionTable;
  role_permissions: RolePermissionTable;
  role_assignments: RoleAssignmentTable;
  features: FeatureTable;
  team_invitations: TeamInvitationTable;
  team_invitation_roles: TeamInvitationRoleTable;
  sessions: SessionTable;
  pending_device_sign_ins: PendingDeviceSignInTable;
  oauth_accounts: OauthAccountTable;
  otp_codes: OtpCodeTable;
  passkeys: PasskeyTable;
  user_totp_credentials: UserTotpCredentialTable;
  mfa_backup_codes: MfaBackupCodeTable;
  webauthn_challenges: WebauthnChallengeTable;
  user_avatars: UserAvatarTable;

  // Courses & Curriculum
  courses: CourseTable;
  categories: CategoryTable;
  course_sections: CourseSectionTable;
  course_lessons: CourseLessonTable;
  lesson_resources: LessonResourceTable;
  course_access_rules: CourseAccessRuleTable;
  course_pricing: CoursePricingTable;
  course_settings: CourseSettingsTable;
  course_includes: CourseIncludeTable;
  course_links: CourseLinkTable;
  course_deletion_jobs: CourseDeletionJobTable;
  course_deletion_storage_items: CourseDeletionStorageItemTable;

  // Media & Video Processing
  media_assets: MediaAssetTable;
  image_jobs: ImageJobTable;
  video_outputs: VideoOutputTable;
  video_jobs: VideoJobTable;
  youtube_import_jobs: YoutubeImportJobTable;
  media_sources: MediaSourceTable;

  // Commerce, Orders & Payments
  course_bundles: CourseBundleTable;
  course_bundle_items: CourseBundleItemTable;
  carts: CartTable;
  cart_items: CartItemTable;
  coupons: CouponTable;
  coupon_redemptions: CouponRedemptionTable;
  orders: OrderTable;
  invoice_number_counters: InvoiceNumberCounterTable;
  order_items: OrderItemTable;
  order_item_courses: OrderItemCourseTable;
  payments: PaymentTable;
  payment_attempts: PaymentAttemptTable;
  refunds: RefundTable;
  access_grants: AccessGrantTable;
  enrollments: EnrollmentTable;
  creator_payment_configs: CreatorPaymentConfigTable;
  refund_requests: RefundRequestTable;
  manual_payment_requests: ManualPaymentRequestTable;
  credit_notes: CreditNoteTable;

  // Learning Interactions
  learning_threads: LearningThreadTable;
  learning_replies: LearningReplyTable;
  learning_likes: LearningLikeTable;
  learning_bookmarks: LearningBookmarkTable;
  learning_follows: LearningFollowTable;
  learning_mentions: LearningMentionTable;
  learning_notes: LearningNoteTable;
  learning_attachments: LearningAttachmentTable;
  learning_reports: LearningReportTable;
  learning_suspensions: LearningSuspensionTable;
  learning_audit_logs: LearningAuditLogTable;

  // Webhooks & Outbox
  webhook_events: WebhookEventTable;
  callback_inbox: CallbackInboxTable;
  outbox_events: OutboxEventTable;

  // Notifications
  notifications: NotificationTable;
  notification_deliveries: NotificationDeliveryTable;
  notification_preferences: NotificationPreferenceTable;

  // Learner state
  quizzes: QuizTable;
  quiz_versions: QuizVersionTable;
  quiz_questions: QuizQuestionTable;
  quiz_question_options: QuizQuestionOptionTable;
  quiz_assignments: QuizAssignmentTable;
  course_quiz_pricing: CourseQuizPricingTable;
  course_quiz_access_grants: CourseQuizAccessGrantTable;
  quiz_attempts: QuizAttemptTable;
  quiz_attempt_answers: QuizAttemptAnswerTable;
  learning_daily_activity: LearningDailyActivityTable;
  learning_daily_course_activity: LearningDailyCourseActivityTable;
  learning_progress: LearningProgressTable;
  user_learning_settings: UserLearningSettingsTable;
  home_page_settings: HomePageSettingsTable;
  platform_settings: PlatformSettingsTable;
  quotes: QuoteTable;
  wishlist_items: WishlistItemTable;

  // Derived from lesson descriptions
  lesson_chapters: LessonChapterTable;

  // Subtitle tracks for lesson videos
  lesson_subtitles: LessonSubtitleTable;
}

export type PurchaseTable = OrderTable;
export type PurchaseItemTable = OrderItemTable;

/**
 * A query runner over the whole `Database` schema — either the top-level
 * connection or a `Kysely<Database>.transaction()` context.
 */
export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
