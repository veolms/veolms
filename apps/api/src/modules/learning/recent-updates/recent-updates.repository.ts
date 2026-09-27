import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

export interface RecentUpdateCourseRow {
  course_id: string;
  course_slug: string;
  course_title: string;
  course_thumbnail_url: string | null;
  course_thumbnail_media_id: string | null;
  recent_lesson_count: number | bigint;
  latest_updated_at: Date;
}

export interface RecentUpdateLessonRow {
  course_id: string;
  lesson_id: string;
  lesson_title: string;
  lesson_number: number | bigint;
  lesson_updated_at: Date;
}

export interface RecentUpdatesRepository {
  listRecentUpdateCourses(options: {
    userId: string;
    now: Date;
    cutoff: Date;
    limit: number;
  }): Promise<RecentUpdateCourseRow[]>;
  listRecentUpdateLessons(options: {
    courseIds: readonly string[];
    cutoff: Date;
    lessonsPerCourse: number;
  }): Promise<RecentUpdateLessonRow[]>;
}

export function createRecentUpdatesRepository({
  database,
}: {
  database: DatabaseExecutor;
}): RecentUpdatesRepository {
  async function listRecentUpdateCourses({
    userId,
    now,
    cutoff,
    limit,
  }: {
    userId: string;
    now: Date;
    cutoff: Date;
    limit: number;
  }): Promise<RecentUpdateCourseRow[]> {
    return await database
      .selectFrom("courses as c")
      .innerJoin("course_sections as s", "s.course_id", "c.id")
      .innerJoin("course_lessons as l", "l.section_id", "s.id")
      .select([
        "c.id as course_id",
        "c.slug as course_slug",
        "c.title as course_title",
        "c.thumbnail_url as course_thumbnail_url",
        "c.thumbnail_media_id as course_thumbnail_media_id",
        sql<number>`count(*)::int`.as("recent_lesson_count"),
        sql<Date>`max(l.updated_at)`.as("latest_updated_at"),
      ])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("enrollments as e")
            .select("e.id")
            .whereRef("e.course_id", "=", "c.id")
            .where("e.user_id", "=", userId)
            .where("e.status", "=", "active")
            .where((expiry) =>
              expiry.or([
                expiry("e.access_expires_at", "is", null),
                expiry("e.access_expires_at", ">", now),
              ]),
            ),
        ),
      )
      .where("c.status", "=", "published")
      .where("c.deleted_at", "is", null)
      .whereRef("l.course_id", "=", "c.id")
      .where("s.deleted_at", "is", null)
      .where("l.is_published", "=", true)
      .where("l.deleted_at", "is", null)
      .where("l.updated_at", ">=", cutoff)
      .groupBy([
        "c.id",
        "c.slug",
        "c.title",
        "c.thumbnail_url",
        "c.thumbnail_media_id",
      ])
      .orderBy("latest_updated_at", "desc")
      .orderBy("course_id", "asc")
      .limit(limit)
      .execute();
  }

  async function listRecentUpdateLessons({
    courseIds,
    cutoff,
    lessonsPerCourse,
  }: {
    courseIds: readonly string[];
    cutoff: Date;
    lessonsPerCourse: number;
  }): Promise<RecentUpdateLessonRow[]> {
    if (courseIds.length === 0) return [];

    // The first window preserves the lesson-player's flattened curriculum
    // number across every published lesson. The second window is applied
    // only after the recent-update cutoff, so old lessons do not consume the
    // bounded preview slots.
    const orderedLessons = database
      .selectFrom("courses as c")
      .innerJoin("course_sections as s", "s.course_id", "c.id")
      .innerJoin("course_lessons as l", "l.section_id", "s.id")
      .select([
        "c.id as course_id",
        "l.id as lesson_id",
        "l.title as lesson_title",
        "l.updated_at as lesson_updated_at",
        sql<number>`row_number() over (
          partition by c.id
          order by s.position asc, l.position asc, l.id asc
        )`.as("lesson_number"),
      ])
      .where("c.id", "in", courseIds)
      .where("c.status", "=", "published")
      .where("c.deleted_at", "is", null)
      .whereRef("l.course_id", "=", "c.id")
      .where("s.deleted_at", "is", null)
      .where("l.is_published", "=", true)
      .where("l.deleted_at", "is", null)
      .as("ordered_lessons");

    const recentRankedLessons = database
      .selectFrom(orderedLessons)
      .select([
        "course_id",
        "lesson_id",
        "lesson_title",
        "lesson_number",
        "lesson_updated_at",
        sql<number>`row_number() over (
          partition by course_id
          order by lesson_updated_at desc, lesson_id desc
        )`.as("recent_lesson_rank"),
      ])
      .where("lesson_updated_at", ">=", cutoff)
      .as("recent_ranked_lessons");

    return await database
      .selectFrom(recentRankedLessons)
      .select([
        "course_id",
        "lesson_id",
        "lesson_title",
        "lesson_number",
        "lesson_updated_at",
      ])
      .where("recent_lesson_rank", "<=", lessonsPerCourse)
      .orderBy("course_id", "asc")
      .orderBy("lesson_updated_at", "desc")
      .orderBy("lesson_id", "desc")
      .execute();
  }

  return { listRecentUpdateCourses, listRecentUpdateLessons };
}
