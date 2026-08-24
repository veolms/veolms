import type { Generated, JSONColumnType } from "kysely";
import type {
  JobTable,
  WorkerEventTable,
  WorkerMonitoringTable,
  WorkerTable,
} from "./fleet/schema.ts";

export * from "./fleet/schema.ts";

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
  description: string | null;
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
  starts_at: Date | null;
  expires_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type PricingType = "free" | "paid";

export interface CoursePricingTable {
  id: string;
  course_id: string;
  pricing_type: PricingType;
  price: number;
  currency: string;
  sale_price: number | null;
  sale_starts_at: Date | null;
  sale_ends_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourseSettingsTable {
  id: string;
  course_id: string;
  allow_qa: Generated<boolean>;
  allow_comments: Generated<boolean>;
  allow_reviews: Generated<boolean>;
  allow_downloads: Generated<boolean>;
  certificate_enabled: Generated<boolean>;
  language: Generated<string>;
  estimated_duration: number | null;
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
  jobs: JobTable;
  workers: WorkerTable;
  worker_monitoring: WorkerMonitoringTable;
  worker_events: WorkerEventTable;
  
  categories: CategoryTable;
  media_assets: MediaAssetTable;
  course_sections: CourseSectionTable;
  course_lessons: CourseLessonTable;
  lesson_resources: LessonResourceTable;
  course_access_rules: CourseAccessRuleTable;
  course_pricing: CoursePricingTable;
  course_settings: CourseSettingsTable;
  video_jobs: VideoJobTable;
  video_outputs: VideoOutputTable;
}

