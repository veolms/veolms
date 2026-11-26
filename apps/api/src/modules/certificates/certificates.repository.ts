import crypto from "node:crypto";

import type { DatabaseExecutor, Json } from "@veolms/database";
import { sql } from "kysely";

export interface CertificateRow {
  id: string;
  public_code: string;
  user_id: string | null;
  course_id: string | null;
  status: "active" | "revoked";
  revision: number;
  recipient_name: string;
  course_title: string;
  course_slug: string | null;
  academy_name: string;
  site_origin: string;
  template_key: string;
  template_version: number;
  issued_on: string;
  issued_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  name_corrections: number;
}

function selectCertificates(database: DatabaseExecutor) {
  return database.selectFrom("certificates").select([
    "certificates.id",
    "certificates.public_code",
    "certificates.user_id",
    "certificates.course_id",
    "certificates.status",
    "certificates.revision",
    "certificates.recipient_name",
    "certificates.course_title",
    "certificates.course_slug",
    "certificates.academy_name",
    "certificates.site_origin",
    "certificates.template_key",
    "certificates.template_version",
    // A `date` column would come back as a Date at local midnight.
    sql<string>`certificates.issued_on::text`.as("issued_on"),
    "certificates.issued_at",
    "certificates.revoked_at",
    "certificates.revoke_reason",
    "certificates.name_corrections",
  ]);
}

/**
 * Makes claims for one learner and course take turns until the transaction
 * ends, so two requests cannot both decide nothing is issued yet.
 */
export async function lockLearnerCourse(
  transaction: DatabaseExecutor,
  userId: string,
  courseId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`veolms:certificate:${userId}:${courseId}`}))`.execute(
    transaction,
  );
}

export async function findActiveCertificateForLearner(
  database: DatabaseExecutor,
  userId: string,
  courseId: string,
): Promise<CertificateRow | undefined> {
  return (await selectCertificates(database)
    .where("certificates.user_id", "=", userId)
    .where("certificates.course_id", "=", courseId)
    .where("certificates.status", "=", "active")
    .executeTakeFirst()) as CertificateRow | undefined;
}

export async function findCertificateByCode(
  database: DatabaseExecutor,
  code: string,
): Promise<CertificateRow | undefined> {
  return (await selectCertificates(database)
    .where("certificates.public_code", "=", code)
    .executeTakeFirst()) as CertificateRow | undefined;
}

export async function findCertificateById(
  database: DatabaseExecutor,
  id: string,
): Promise<CertificateRow | undefined> {
  return (await selectCertificates(database)
    .where("certificates.id", "=", id)
    .executeTakeFirst()) as CertificateRow | undefined;
}

/** A learner's certificates, revoked ones included, newest first. */
export async function listCertificatesForUser(
  database: DatabaseExecutor,
  userId: string,
): Promise<CertificateRow[]> {
  return (await selectCertificates(database)
    .where("certificates.user_id", "=", userId)
    .orderBy("certificates.issued_at", "desc")
    .orderBy("certificates.id", "desc")
    .limit(500)
    .execute()) as CertificateRow[];
}

export interface StaffCertificateRow extends CertificateRow {
  learner_name: string | null;
  learner_email: string | null;
}

/**
 * One page of a course's certificates, newest first. `cursor` is the last
 * row's "<issued_at ISO>|<id>". `query` matches the printed name, the
 * learner's name or email, or the code.
 */
export async function listCertificatesForCourse(
  database: DatabaseExecutor,
  courseId: string,
  options: {
    limit: number;
    cursor?: { issuedAt: Date; id: string } | undefined;
    query?: string | undefined;
  },
): Promise<StaffCertificateRow[]> {
  let statement = selectCertificates(database)
    .leftJoin("users", "users.id", "certificates.user_id")
    .select([
      "users.display_name as learner_name",
      "users.email as learner_email",
    ])
    .where("certificates.course_id", "=", courseId);
  if (options.cursor) {
    const { issuedAt, id } = options.cursor;
    statement = statement.where((eb) =>
      eb.or([
        eb("certificates.issued_at", "<", issuedAt),
        eb.and([
          eb("certificates.issued_at", "=", issuedAt),
          eb("certificates.id", "<", id),
        ]),
      ]),
    );
  }
  if (options.query) {
    const like = `%${options.query.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
    const code = options.query.toUpperCase().replace(/[\s-]+/gu, "");
    statement = statement.where((eb) =>
      eb.or([
        eb("certificates.recipient_name", "ilike", like),
        eb("users.display_name", "ilike", like),
        eb("users.email", "ilike", like),
        eb("certificates.public_code", "=", code),
      ]),
    );
  }
  return (await statement
    .orderBy("certificates.issued_at", "desc")
    .orderBy("certificates.id", "desc")
    .limit(options.limit)
    .execute()) as StaffCertificateRow[];
}

export async function countActiveCertificatesForCourse(
  database: DatabaseExecutor,
  courseId: string,
): Promise<number> {
  const row = await database
    .selectFrom("certificates")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("course_id", "=", courseId)
    .where("status", "=", "active")
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export interface NewCertificate {
  publicCode: string;
  userId: string;
  courseId: string;
  recipientName: string;
  courseTitle: string;
  courseSlug: string;
  academyName: string;
  siteOrigin: string;
  templateKey: string;
  templateVersion: number;
  issuedOn: string;
  issuedAt: Date;
  issuedBy: string | null;
  designId: string | null;
  ruleSnapshot: Json;
}

/**
 * Inserts the certificate, or nothing when the learner already holds an
 * active one for the course (the partial unique index). Returns the new
 * row's id, or null.
 */
export async function insertCertificate(
  database: DatabaseExecutor,
  values: NewCertificate,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const row = await database
    .insertInto("certificates")
    .values({
      id,
      public_code: values.publicCode,
      user_id: values.userId,
      course_id: values.courseId,
      recipient_name: values.recipientName,
      course_title: values.courseTitle,
      course_slug: values.courseSlug,
      academy_name: values.academyName,
      site_origin: values.siteOrigin,
      template_key: values.templateKey,
      template_version: values.templateVersion,
      issued_on: values.issuedOn,
      issued_at: values.issuedAt,
      issued_by: values.issuedBy,
      design_id: values.designId,
      rule_snapshot: JSON.stringify(values.ruleSnapshot),
    })
    .onConflict((conflict) =>
      conflict
        .columns(["user_id", "course_id"])
        .where("status", "=", "active")
        .doNothing(),
    )
    .returning("id")
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function insertEvent(
  database: DatabaseExecutor,
  values: {
    certificateId: string;
    type: "issued" | "name_corrected" | "revoked" | "restored";
    actorId: string | null;
    data?: Record<string, Json>;
  },
): Promise<void> {
  await database
    .insertInto("certificate_events")
    .values({
      id: crypto.randomUUID(),
      certificate_id: values.certificateId,
      type: values.type,
      actor_id: values.actorId,
      data: JSON.stringify(values.data ?? {}),
    })
    .execute();
}

export async function updateRecipientName(
  database: DatabaseExecutor,
  id: string,
  recipientName: string,
  countsAsCorrection: boolean,
): Promise<void> {
  await database
    .updateTable("certificates")
    .set((eb) => ({
      recipient_name: recipientName,
      revision: eb("revision", "+", 1),
      name_corrections: countsAsCorrection
        ? eb("name_corrections", "+", 1)
        : eb.ref("name_corrections"),
      updated_at: new Date(),
    }))
    .where("id", "=", id)
    .execute();
}

export async function markRevoked(
  database: DatabaseExecutor,
  id: string,
  values: { revokedBy: string; reason: string; at: Date },
): Promise<void> {
  await database
    .updateTable("certificates")
    .set({
      status: "revoked",
      revoked_at: values.at,
      revoked_by: values.revokedBy,
      revoke_reason: values.reason,
      updated_at: values.at,
    })
    .where("id", "=", id)
    .execute();
}

export async function markRestored(
  database: DatabaseExecutor,
  id: string,
  at: Date,
): Promise<void> {
  await database
    .updateTable("certificates")
    .set({
      status: "active",
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      updated_at: at,
    })
    .where("id", "=", id)
    .execute();
}

export async function findUnlock(
  database: DatabaseExecutor,
  userId: string,
  courseId: string,
): Promise<{ unlocked_at: Date; percent: string } | undefined> {
  return await database
    .selectFrom("certificate_unlocks")
    .select(["unlocked_at", "percent"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

/** Keeps the first unlock: a later one changes nothing. */
export async function insertUnlock(
  database: DatabaseExecutor,
  userId: string,
  courseId: string,
  percent: number,
): Promise<void> {
  await database
    .insertInto("certificate_unlocks")
    .values({ user_id: userId, course_id: courseId, percent })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "course_id"]).doNothing(),
    )
    .execute();
}

export async function findThresholdPercent(
  database: DatabaseExecutor,
  courseId: string,
): Promise<number | null> {
  const row = await database
    .selectFrom("course_certificate_settings")
    .select("threshold_percent")
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  return row ? Number(row.threshold_percent) : null;
}

export async function upsertThresholdPercent(
  database: DatabaseExecutor,
  courseId: string,
  thresholdPercent: number,
): Promise<void> {
  await database
    .insertInto("course_certificate_settings")
    .values({ course_id: courseId, threshold_percent: thresholdPercent })
    .onConflict((conflict) =>
      conflict.column("course_id").doUpdateSet({
        threshold_percent: thresholdPercent,
        updated_at: new Date(),
      }),
    )
    .execute();
}

export async function deleteThresholdPercent(
  database: DatabaseExecutor,
  courseId: string,
): Promise<void> {
  await database
    .deleteFrom("course_certificate_settings")
    .where("course_id", "=", courseId)
    .execute();
}

/** A learner's id and profile name (what a certificate prints). */
export async function findLearner(
  database: DatabaseExecutor,
  userId: string,
): Promise<{ id: string; display_name: string } | undefined> {
  return await database
    .selectFrom("users")
    .select(["id", "display_name"])
    .where("id", "=", userId)
    .executeTakeFirst();
}

/**
 * Learners enrolled in a course (any enrolment status), for staff issuing
 * certificates by hand: the 30 that best match `query` (name, username or
 * email), by name.
 */
export async function listCourseLearners(
  database: DatabaseExecutor,
  courseId: string,
  query: string | undefined,
): Promise<
  {
    id: string;
    display_name: string;
    email: string | null;
    has_certificate: boolean;
  }[]
> {
  let statement = database
    .selectFrom("enrollments as e")
    .innerJoin("users as u", "u.id", "e.user_id")
    .select([
      "u.id",
      "u.display_name",
      "u.email",
      sql<boolean>`exists (
        select 1 from certificates c
        where c.user_id = u.id and c.course_id = ${courseId}
          and c.status = 'active'
      )`.as("has_certificate"),
    ])
    .where("e.course_id", "=", courseId);
  if (query) {
    const like = `%${query.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
    statement = statement.where((eb) =>
      eb.or([
        eb("u.display_name", "ilike", like),
        eb("u.username", "ilike", like),
        eb("u.email", "ilike", like),
      ]),
    );
  }
  return (await statement.orderBy("u.display_name").limit(30).execute()) as {
    id: string;
    display_name: string;
    email: string | null;
    has_certificate: boolean;
  }[];
}
