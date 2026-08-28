import type { Generated, Kysely, Transaction } from "kysely";

export type CourseStatus = "draft" | "published" | "archived";
export type OtpIdentifierType = "email" | "phone";
export type OtpPurpose =
  "login" | "registration" | "email_verification" | "phone_verification";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

export interface CourseTable {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  description: string | null;
  status: CourseStatus;
  creator_id: string | null;
  category_id: string | null;
  difficulty: CourseDifficulty | null;
  thumbnail_media_id: string | null;
  trailer_media_id: string | null;
  instructor_alias: string | null;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  published_at: Date | null;
  deleted_at: Date | null;
}

export interface AcademyTable {
  id: string;
  name: string;
  logo_url: string | null;
  custom_domain: string | null;
  setup_completed: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: string;
  email: string | null;
  phone_no: string | null;
  username: string;
  display_name: string;
  email_verified_at: Date | null;
  mfa_mandatory: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RoleTable {
  id: string;
  name: string;
  description: string | null;
  last_permission_update: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserRoleTable {
  user_id: string;
  role_id: string;
  created_at: Generated<Date>;
}

export interface MenuTable {
  id: string;
  parent_id: string | null;
  label: string;
  route_link: string;
  icon: string | null;
  expanded: Generated<boolean>;
  check_list: string | null;
  is_both: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PermissionTable {
  id: string;
  role_id: string;
  menu_id: string;
  can_create: Generated<boolean>;
  can_read: Generated<boolean>;
  can_update: Generated<boolean>;
  can_delete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SessionTable {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  mfa_verified: Generated<boolean>;
  revoked_at: Date | null;
  expires_at: Date;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OauthAccountTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OtpCodeTable {
  id: string;
  identifier: string;
  identifier_type: OtpIdentifierType | string;
  purpose: OtpPurpose | string;
  code_hash: string;
  attempts: Generated<number>;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface PasskeyTable {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: Generated<number>;
  transports: string | null;
  created_at: Generated<Date>;
}

export interface UserTotpCredentialTable {
  id: string;
  user_id: string;
  secret_encrypted: string;
  enabled: Generated<boolean>;
  last_used_step: string | null;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MfaBackupCodeTable {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface WebauthnChallengeTable {
  id: string;
  user_id: string | null;
  challenge: string;
  type: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface CategoryTable {
  id: string;
  name: string;
  slug: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export type MediaAssetStatus = "uploading" | "uploaded" | "ready" | "failed";

export interface MediaAssetTable {
  id: string;
  owner_id: string;
  type: string;
  storage_provider: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status: MediaAssetStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourseSectionTable {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export type LessonContentType = "video" | "document";

export interface CourseLessonTable {
  id: string;
  course_id: string;
  section_id: string;
  title: string;
  description: string | null;
  content_type: LessonContentType;
  content_media_id: string | null;
  position: number;
  is_preview: Generated<boolean>;
  is_published: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface LessonResourceTable {
  id: string;
  lesson_id: string;
  media_asset_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: Generated<Date>;
  deleted_at: Date | null;
}

export type AccessType = "everyone" | "restricted";
export type AccessDurationType =
  "lifetime" | "fixed_duration" | "custom_expiration";

export interface CourseAccessRuleTable {
  id: string;
  course_id: string;
  access_type: AccessType;
  duration_type: AccessDurationType;
  duration_days: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type PricingType = "free" | "paid";

export interface CoursePricingTable {
  id: string;
  course_id: string;
  pricing_type: PricingType;
  price: number;
  currency: Generated<string>;
  sale_price: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourseSettingsTable {
  id: string;
  course_id: string;
  allow_qa: Generated<boolean>;
  allow_comments: Generated<boolean>;
  allow_downloads: Generated<boolean>;
  certificate_enabled: Generated<boolean>;
  show_instructor_name: Generated<boolean>;
  language: Generated<string>;
  estimated_duration: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourseIncludeTable {
  id: string;
  course_id: string;
  text: string;
  icon: string | null;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type VideoJobStatus = "queued" | "processing" | "completed" | "failed";
export type JobStatus = VideoJobStatus;
export type VideoJobStage =
  | "queued"
  | "downloading"
  | "transcoding"
  | "uploading"
  | "finalizing"
  | "completed"
  | "failed";

export interface VideoJobTable {
  id: string;
  video_id: string;
  input_path: string;
  status: VideoJobStatus;
  progress_percent: Generated<number>;
  current_stage: VideoJobStage;
  worker_id: string | null;
  quality: number[];
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error: string | null;
}

export interface VideoOutputTable {
  id: string;
  video_id: string;
  master_playlist_path: string;
  created_at: Generated<Date>;
}

export type BundleStatus = "draft" | "published" | "archived";
export type CartItemType = "course" | "bundle";
export type OrderItemType = "course" | "bundle";
export type CouponDiscountType = "percentage" | "fixed";
export type OrderStatus =
  | "pending"
  | "payment_processing"
  | "paid"
  | "payment_failed"
  | "cancelled"
  | "expired"
  | "partially_refunded"
  | "refunded";
export type PaymentStatus =
  | "initiated"
  | "processing"
  | "captured"
  | "failed"
  | "refunded";
export type PaymentAttemptStatus =
  | "initiated"
  | "processing"
  | "captured"
  | "failed";
export type RefundStatus = "pending" | "processed" | "failed";
export type EnrollmentStatus = "active" | "suspended" | "revoked" | "expired";
export type EnrollmentSource =
  | "direct_purchase"
  | "bundle_purchase"
  | "free_grant"
  | "admin_grant";

export interface CourseBundleTable {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_media_id: string | null;
  status: BundleStatus;
  price: number;
  currency: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface CourseBundleItemTable {
  id: string;
  bundle_id: string;
  course_id: string;
  created_at: Generated<Date>;
}

export interface CartTable {
  id: string;
  user_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CartItemTable {
  id: string;
  cart_id: string;
  item_type: CartItemType;
  course_id: string | null;
  bundle_id: string | null;
  created_at: Generated<Date>;
}

export interface CouponTable {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: Generated<number>;
  starts_at: Date;
  expires_at: Date;
  global_usage_limit: number | null;
  per_user_limit: Generated<number>;
  is_active: Generated<boolean>;
  restricted_course_ids: string[] | null;
  restricted_bundle_ids: string[] | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CouponRedemptionTable {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  discount_amount: number;
  created_at: Generated<Date>;
}

export interface OrderTable {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  currency: string;
  subtotal_amount: number;
  discount_amount: Generated<number>;
  tax_amount: Generated<number>;
  total_amount: number;
  coupon_id: string | null;
  idempotency_key: string | null;
  expires_at: Date;
  paid_at: Date | null;
  gstin: string | null;
  cgst_amount: Generated<number>;
  sgst_amount: Generated<number>;
  igst_amount: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderItemTable {
  id: string;
  order_id: string;
  item_type: OrderItemType;
  course_id: string | null;
  bundle_id: string | null;
  title_snapshot: string;
  unit_price: number;
  discount_amount: Generated<number>;
  tax_amount: Generated<number>;
  final_amount: number;
  hsn_sac_code: string | null;
  tax_rate_percent: Generated<number>;
  cgst_amount: Generated<number>;
  sgst_amount: Generated<number>;
  igst_amount: Generated<number>;
  created_at: Generated<Date>;
}

export interface PaymentTable {
  id: string;
  order_id: string;
  gateway_provider: string;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  gateway_key_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: unknown | null;
  error_code: string | null;
  error_description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PaymentAttemptTable {
  id: string;
  payment_id: string;
  gateway_payment_id: string | null;
  attempt_number: number;
  status: PaymentAttemptStatus;
  error_code: string | null;
  error_description: string | null;
  raw_payload: unknown | null;
  created_at: Generated<Date>;
}

export interface RefundTable {
  id: string;
  order_id: string;
  payment_id: string;
  gateway_refund_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EnrollmentTable {
  id: string;
  user_id: string;
  course_id: string;
  order_id: string | null;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  access_starts_at: Generated<Date>;
  access_expires_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WebhookEventTable {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface AccessGrantTable {
  id: string;
  user_id: string;
  course_id: string;
  order_id: string | null;
  status: "active" | "suspended" | "revoked" | "expired";
  source: "purchase" | "bundle_purchase" | "free_grant" | "admin_grant";
  valid_from: Generated<Date>;
  valid_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CallbackInboxTable {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface OutboxEventTable {
  id: string;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface CreatorPaymentConfigTable {
  id: string;
  creator_id: string;
  provider: string;
  encrypted_key_id: string;
  encrypted_key_secret: string;
  encrypted_webhook_secret: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type RefundRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RefundRequestTable {
  id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: Generated<RefundRequestStatus>;
  admin_notes: string | null;
  resolved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type ManualPaymentStatus = "pending" | "verified" | "rejected";

export interface ManualPaymentRequestTable {
  id: string;
  order_id: string;
  user_id: string;
  payment_method: string;
  transaction_reference: string;
  proof_media_id: string | null;
  status: Generated<ManualPaymentStatus>;
  admin_notes: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CreditNoteTable {
  id: string;
  credit_note_number: string;
  refund_id: string;
  order_id: string;
  user_id: string;
  total_refund_amount: number;
  tax_adjustment_amount: Generated<number>;
  created_at: Generated<Date>;
}

export interface Database {
  courses: CourseTable;
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
  categories: CategoryTable;
  media_assets: MediaAssetTable;
  course_sections: CourseSectionTable;
  course_lessons: CourseLessonTable;
  lesson_resources: LessonResourceTable;
  course_access_rules: CourseAccessRuleTable;
  course_pricing: CoursePricingTable;
  course_settings: CourseSettingsTable;
  course_includes: CourseIncludeTable;
  video_jobs: VideoJobTable;
  video_outputs: VideoOutputTable;
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
  webhook_events: WebhookEventTable;
  callback_inbox: CallbackInboxTable;
  outbox_events: OutboxEventTable;
  creator_payment_configs: CreatorPaymentConfigTable;
  refund_requests: RefundRequestTable;
  manual_payment_requests: ManualPaymentRequestTable;
  credit_notes: CreditNoteTable;
}

export type PurchaseTable = OrderTable;
export type PurchaseItemTable = OrderItemTable;

/**
 * A query runner over the whole `Database` schema — either the top-level
 * connection or a `Kysely<Database>.transaction()` context. Repository
 * functions that need to compose inside a caller's transaction (e.g.
 * commerce services calling into courses' repositories from within a
 * checkout transaction) should accept this instead of a bare
 * `Kysely<Database>`, so callers can pass a `Transaction<Database>` without
 * an `as any` cast. `Transaction<Database>` is not structurally assignable
 * to `Kysely<Database>` in Kysely's types, which is why this union has to be
 * spelled out explicitly rather than relying on `Kysely<Database>` alone.
 */
export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;


