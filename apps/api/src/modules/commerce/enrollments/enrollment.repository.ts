import type { EnrollmentStatus, EnrollmentSource } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findEnrollment(
  database: Executor,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("enrollments")
    .selectAll()
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function listUserEnrollments(
  database: Executor,
  userId: string,
  status?: EnrollmentStatus,
) {
  let query = database
    .selectFrom("enrollments")
    .selectAll()
    .where("user_id", "=", userId);

  if (status) {
    query = query.where("status", "=", status);
  }

  return await query.orderBy("created_at", "desc").execute();
}

export async function listUserEnrolledCourseIds(
  database: Executor,
  userId: string,
) {
  const rows = await database
    .selectFrom("enrollments")
    .select("course_id")
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .execute();

  return rows.map((r) => r.course_id);
}

export async function insertEnrollment(
  database: Executor,
  values: {
    id: string;
    user_id: string;
    course_id: string;
    order_id?: string | null;
    status: EnrollmentStatus;
    source: EnrollmentSource;
    access_starts_at?: Date;
    access_expires_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("enrollments")
    .values(values)
    .onConflict((oc) => oc.columns(["user_id", "course_id"]).doNothing())
    .returningAll()
    .executeTakeFirst();
}

export async function updateEnrollmentStatus(
  database: Executor,
  userId: string,
  courseId: string,
  status: EnrollmentStatus,
) {
  return await database
    .updateTable("enrollments")
    .set({
      status,
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .returningAll()
    .executeTakeFirst();
}
