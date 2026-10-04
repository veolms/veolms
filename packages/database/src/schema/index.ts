import type { Kysely, Transaction } from "kysely";

// Re-export all domain schema types
export * from "./auth.schema.ts";
export * from "./authorization.schema.ts";
export * from "./chapters.schema.ts";
export * from "./commerce.schema.ts";
export * from "./courses.schema.ts";
export * from "./json.schema.ts";
export * from "./learning-interactions.schema.ts";
export * from "./learning-progress.schema.ts";
export * from "./media.schema.ts";
export * from "./notifications.schema.ts";
export * from "./quizzes.schema.ts";
export * from "./webhooks.schema.ts";

// Import table interfaces to assemble unified Database schema
import type {
  AcademyTable,
  MenuPermissionTable,
  MenuTable,
  MfaBackupCodeTable,
  OauthAccountTable,
  OtpCodeTable,
  PasskeyTable,
  SessionTable,
  UserAvatarTable,
  UserRoleTable,
  UserTable,
  UserTotpCredentialTable,
  WebauthnChallengeTable,
} from "./auth.schema.ts";
import type {
  FeatureTable,
  PermissionTable,
  RoleAssignmentTable,
  RolePermissionTable,
  RoleTable,
} from "./authorization.schema.ts";
import type { LessonChapterTable } from "./chapters.schema.ts";
import type {
  AccessGrantTable,
  CartItemTable,
  CartTable,
  CouponRedemptionTable,
  CouponTable,
  CourseBundleItemTable,
  CourseBundleTable,
  CreatorPaymentConfigTable,
  CreditNoteTable,
  EnrollmentTable,
  ManualPaymentRequestTable,
  OrderItemTable,
  OrderTable,
  PaymentAttemptTable,
  PaymentTable,
  RefundRequestTable,
  RefundTable,
} from "./commerce.schema.ts";
import type {
  CategoryTable,
  CourseAccessRuleTable,
  CourseDeletionJobTable,
  CourseDeletionStorageItemTable,
  CourseIncludeTable,
  CourseLessonTable,
  CoursePricingTable,
  CourseSectionTable,
  CourseSettingsTable,
  CourseTable,
  LessonResourceTable,
} from "./courses.schema.ts";
import type {
  LearningAttachmentTable,
  LearningAuditLogTable,
  LearningBookmarkTable,
  LearningFollowTable,
  LearningLikeTable,
  LearningMentionTable,
  LearningNoteTable,
  LearningReplyTable,
  LearningReportTable,
  LearningSuspensionTable,
  LearningThreadTable,
} from "./learning-interactions.schema.ts";
import type { LearningProgressTable } from "./learning-progress.schema.ts";
import type {
  ImageJobTable,
  MediaAssetTable,
  VideoJobTable,
  VideoOutputTable,
} from "./media.schema.ts";
import type {
  NotificationDeliveryTable,
  NotificationPreferenceTable,
  NotificationTable,
} from "./notifications.schema.ts";
import type {
  CourseQuizAccessGrantTable,
  CourseQuizPricingTable,
  QuizAssignmentTable,
  QuizAttemptAnswerTable,
  QuizAttemptTable,
  QuizQuestionOptionTable,
  QuizQuestionTable,
  QuizTable,
  QuizVersionTable,
} from "./quizzes.schema.ts";
import type { CallbackInboxTable, OutboxEventTable, WebhookEventTable } from "./webhooks.schema.ts";

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
  sessions: SessionTable;
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
  course_deletion_jobs: CourseDeletionJobTable;
  course_deletion_storage_items: CourseDeletionStorageItemTable;

  // Media & Video Processing
  media_assets: MediaAssetTable;
  image_jobs: ImageJobTable;
  video_outputs: VideoOutputTable;
  video_jobs: VideoJobTable;

  // Commerce, Orders & Payments
  course_bundles: CourseBundleTable;
  course_bundle_items: CourseBundleItemTable;
  carts: CartTable;
  cart_items: CartItemTable;
  coupons: CouponTable;
  coupon_redemptions: CouponRedemptionTable;
  orders: OrderTable;
  order_items: OrderItemTable;
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
  learning_progress: LearningProgressTable;

  // Derived from lesson descriptions
  lesson_chapters: LessonChapterTable;
}

export type PurchaseTable = OrderTable;
export type PurchaseItemTable = OrderItemTable;

/**
 * A query runner over the whole `Database` schema — either the top-level
 * connection or a `Kysely<Database>.transaction()` context.
 */
export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
