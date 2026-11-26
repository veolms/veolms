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
