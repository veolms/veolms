import type { Generated } from "kysely";

export type CourseStatus = "draft" | "published" | "archived";
export type CourseDifficulty = "beginner" | "intermediate" | "advanced";
export type LessonContentType = "video" | "document";
export type AccessType = "everyone" | "restricted";
export type AccessDurationType =
  | "lifetime"
  | "fixed_duration"
  | "custom_expiration";
export type PricingType = "free" | "paid";
export type CourseDeletionJobStatus = "scheduled" | "processing" | "failed";
export type CourseDeletionStorageItemStatus =
  | "scheduled"
  | "processing"
  | "failed";
export type CourseDeletionStorageDeleteMode = "object" | "prefix";

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

export interface CategoryTable {
  id: string;
  name: string;
  slug: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
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

export interface CourseAccessRuleTable {
  id: string;
  course_id: string;
  access_type: AccessType;
  duration_type: AccessDurationType;
  duration_days: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

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

export interface CourseDeletionJobTable {
  id: string;
  course_id: string;
  scheduled_for: Date;
  status: CourseDeletionJobStatus;
  attempt_count: Generated<number>;
  next_attempt_at: Date | null;
  lease_until: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CourseDeletionStorageItemTable {
  id: string;
  course_id: string;
  deletion_job_id: string;
  storage_key: string;
  delete_mode: CourseDeletionStorageDeleteMode;
  status: CourseDeletionStorageItemStatus;
  attempt_count: Generated<number>;
  next_attempt_at: Date | null;
  lease_until: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
