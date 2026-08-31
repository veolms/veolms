import type { Kysely, Transaction } from "kysely";

// Re-export all domain schema types
export * from "./auth.schema.ts";
export * from "./courses.schema.ts";
export * from "./media.schema.ts";
export * from "./commerce.schema.ts";
export * from "./webhooks.schema.ts";
export * from "./notifications.schema.ts";
export * from "./json.schema.ts";
export * from "./config.schema.ts";
export * from "./fleet.schema.ts";

// Import table interfaces to assemble unified Database schema
import type {
  SystemConfigTable,
  ThemePresetTable,
  UserPreferenceTable,
  UserNotificationPrefTable,
  UserSecuritySettingTable,
  ConfigAuditLogTable,
} from "./config.schema.ts";

import type {
  AcademyTable,
  UserTable,
  RoleTable,
  UserRoleTable,
  MenuTable,
  PermissionTable,
  SessionTable,
  OauthAccountTable,
  OtpCodeTable,
  PasskeyTable,
  UserTotpCredentialTable,
  MfaBackupCodeTable,
  WebauthnChallengeTable,
} from "./auth.schema.ts";

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
  CourseDeletionJobTable,
  CourseDeletionStorageItemTable,
} from "./courses.schema.ts";

import type { MediaAssetTable, VideoOutputTable } from "./media.schema.ts";

import type {
  CourseBundleTable,
  CourseBundleItemTable,
  CartTable,
  CartItemTable,
  CouponTable,
  CouponRedemptionTable,
  OrderTable,
  OrderItemTable,
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
  VideoJobTable,
  WorkerEventTable,
  WorkerMonitoringTable,
  WorkerTable,
} from "./fleet.schema.ts";

export interface Database {
  // Auth & Academy
  academy: AcademyTable;
  users: UserTable;
  roles: RoleTable;
  user_roles: UserRoleTable;
  menus: MenuTable;
  permissions: PermissionTable;
  sessions: SessionTable;
  oauth_accounts: OauthAccountTable;
  otp_codes: OtpCodeTable;
  passkeys: PasskeyTable;
  user_totp_credentials: UserTotpCredentialTable;
  mfa_backup_codes: MfaBackupCodeTable;
  webauthn_challenges: WebauthnChallengeTable;

  // Config & User Preferences
  system_config: SystemConfigTable;
  theme_presets: ThemePresetTable;
  user_preferences: UserPreferenceTable;
  user_notification_prefs: UserNotificationPrefTable;
  user_security_settings: UserSecuritySettingTable;
  config_audit_log: ConfigAuditLogTable;

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
  video_outputs: VideoOutputTable;

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

  // Webhooks & Outbox
  webhook_events: WebhookEventTable;
  callback_inbox: CallbackInboxTable;
  outbox_events: OutboxEventTable;

  // Notifications
  notifications: NotificationTable;
  notification_deliveries: NotificationDeliveryTable;
  notification_preferences: NotificationPreferenceTable;

  // fleet & media worker
  video_jobs: VideoJobTable;
  workers: WorkerTable;
  worker_monitoring: WorkerMonitoringTable;
  worker_events: WorkerEventTable;
}

export type PurchaseTable = OrderTable;
export type PurchaseItemTable = OrderItemTable;

/**
 * A query runner over the whole `Database` schema — either the top-level
 * connection or a `Kysely<Database>.transaction()` context.
 */
export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
