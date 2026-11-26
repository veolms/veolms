import type { ColumnType, Generated } from "kysely";

import type { Json } from "./json.schema.ts";

/**
 * An issued course certificate. What is printed is a snapshot taken at
 * claim time; the row is never deleted (revoked instead). See migration
 * 20261127100000-create-certificates.
 */
export interface CertificateTable {
  id: string;
  /** 16 Crockford base32 characters, upper case, no dashes. */
  public_code: string;
  user_id: string | null;
  course_id: string | null;
  status: Generated<"active" | "revoked">;
  revision: Generated<number>;
  recipient_name: string;
  course_title: string;
  course_slug: string | null;
  academy_name: string;
  site_origin: string;
  template_key: string;
  template_version: number;
  /** The issue date in the academy's time zone, as YYYY-MM-DD. */
  issued_on: ColumnType<string, string, string>;
  issued_at: Date;
  issued_by: string | null;
  rule_snapshot: Json;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  name_corrections: Generated<number>;
  design_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The first time a learner reached a course's certificate threshold. */
export interface CertificateUnlockTable {
  user_id: string;
  course_id: string;
  unlocked_at: Generated<Date>;
  percent: ColumnType<string, string | number, string | number>;
}

export interface CertificateEventTable {
  id: string;
  certificate_id: string;
  type: "issued" | "name_corrected" | "revoked" | "restored";
  actor_id: string | null;
  data: Generated<Json>;
  created_at: Generated<Date>;
}

/** The completion percentage a course asks for (90 without a row). */
export interface CourseCertificateSettingsTable {
  course_id: string;
  threshold_percent: Generated<number>;
  updated_at: Generated<Date>;
}

/**
 * A blank certificate sheet staff uploaded, with where each detail goes
 * (`layout`, validated by `certificateDesignLayoutSchema` in contracts).
 * One is active at a time; certificates are drawn on it.
 */
export interface CertificateDesignTable {
  id: string;
  name: string;
  storage_key: string;
  content_type: "application/pdf" | "image/png" | "image/jpeg";
  file_size: number;
  page_width: ColumnType<string, number, number>;
  page_height: ColumnType<string, number, number>;
  layout: Json;
  is_active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

/** The academy's certificate settings: one row at most (`id` is true). */
export interface CertificateAcademySettingsTable {
  id: Generated<boolean>;
  threshold_percent: Generated<number>;
  auto_issue: Generated<boolean>;
  signature_key: string | null;
  signature_content_type: "image/png" | "image/jpeg" | null;
  updated_by: string | null;
  updated_at: Generated<Date>;
}
