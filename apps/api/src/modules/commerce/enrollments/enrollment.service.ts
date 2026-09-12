import type { EnrolledCourse } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { sql } from "kysely";
import { toEnrolledCourseContract } from "./enrollment.mapper.ts";

export interface EnrollmentService {
  listEnrolledCourses(userId: string): Promise<EnrolledCourse[]>;
}

export function createEnrollmentService({
  database,
}: {
  database: Executor;
}): EnrollmentService {
  async function listEnrolledCourses(
    userId: string,
  ): Promise<EnrolledCourse[]> {
    // Join enrollments with courses to get course details in a single query.
    // Excludes revoked, expired (past access_expires_at), and suspended
    // enrollments — only "active" with valid access windows are returned.
    const rows = await database
      .selectFrom("enrollments as e")
      .innerJoin("courses as c", "c.id", "e.course_id")
      .leftJoin("learning_space_sessions as lss", (join) =>
        join
          .onRef("lss.course_id", "=", "c.id")
          .onRef("lss.user_id", "=", "e.user_id"),
      )
      .select([
        "e.id as enrollment_id",
        "c.id as course_id",
        "c.slug as course_slug",
        "c.title as course_title",
        "c.short_description as course_description",
        "e.created_at as enrolled_at",
        "e.status as enrollment_status",
        "e.source as enrollment_source",
        "e.access_expires_at",
        "lss.lesson_number",
        "lss.updated_at as last_accessed_at",
      ])
      // Subquery counts for sections
      .select((eb) =>
        eb
          .selectFrom("course_sections as cs")
          .select((sub) => sub.fn.count("cs.id").as("cnt"))
          .whereRef("cs.course_id", "=", "c.id")
          .where("cs.deleted_at", "is", null)
          .as("total_sections"),
      )
      // Subquery counts for lessons
      .select((eb) =>
        eb
          .selectFrom("course_lessons as cl")
          .select((sub) => sub.fn.count("cl.id").as("cnt"))
          .whereRef("cl.course_id", "=", "c.id")
          .where("cl.is_published", "=", true)
          .where("cl.deleted_at", "is", null)
          .as("total_lessons"),
      )
      // Subquery sum for total duration
      .select((eb) =>
        eb
          .selectFrom("course_lessons as cl2")
          .leftJoin(
            "media_assets as lesson_media",
            "lesson_media.id",
            "cl2.content_media_id",
          )
          .select((sub) =>
            sub.fn
              .coalesce(
                sub.fn.sum("lesson_media.duration_seconds"),
                sql<number>`0`,
              )
              .as("dur"),
          )
          .whereRef("cl2.course_id", "=", "c.id")
          .where("cl2.is_published", "=", true)
          .where("cl2.deleted_at", "is", null)
          .as("total_duration_seconds"),
      )
      .where("e.user_id", "=", userId)
      .where("e.status", "=", "active")
      .where((eb) =>
        eb.or([
          eb("e.access_expires_at", "is", null),
          eb("e.access_expires_at", ">", new Date()),
        ]),
      )
      // Only include published courses (hide draft/archived from student view)
      .where("c.status", "=", "published")
      .where("c.deleted_at", "is", null)
      .orderBy("e.created_at", "desc")
      .execute();

    // Thumbnail URL: courses store a thumbnail_media_id FK — we read it
    // separately and convert to a URL.  For the MVP, we pass null and let
    // the frontend fall back to its local slug-based thumbnail map.
    return rows.map((row) =>
      toEnrolledCourseContract({
        enrollment_id: row.enrollment_id,
        course_id: row.course_id,
        course_slug: row.course_slug,
        course_title: row.course_title,
        course_description: row.course_description ?? null,
        course_thumbnail_url: null,
        total_sections: Number(row.total_sections) || 0,
        total_lessons: Number(row.total_lessons) || 0,
        total_duration_seconds: Number(row.total_duration_seconds) || 0,
        enrolled_at: row.enrolled_at,
        enrollment_status: row.enrollment_status,
        enrollment_source: row.enrollment_source,
        access_expires_at: row.access_expires_at,
        lesson_number: row.lesson_number,
        last_accessed_at: row.last_accessed_at,
      }),
    );
  }

  return { listEnrolledCourses };
}
