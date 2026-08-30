import { sql, type Kysely } from "kysely";
import type { CourseDeletionJobStatus, Database } from "@veolms/database";

type DatabaseExecutor = Kysely<Database>;

const CLAIMABLE_STATUSES: CourseDeletionJobStatus[] = ["scheduled", "failed"];

export async function findCourseIncludingDeleted(
  database: DatabaseExecutor,
  courseId: string,
  lock = false,
) {
  let query = database
    .selectFrom("courses")
    .selectAll()
    .where("id", "=", courseId);

  if (lock) {
    query = query.forUpdate();
  }

  return await query.executeTakeFirst();
}

export async function insertCourseDeletionJob(
  database: DatabaseExecutor,
  values: {
    id: string;
    course_id: string;
    scheduled_for: Date;
    status: "scheduled";
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_deletion_jobs").values(values).execute();
}

export async function findCourseDeletionJobForUpdate(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_deletion_jobs")
    .selectAll()
    .where("course_id", "=", courseId)
    .forUpdate()
    .executeTakeFirst();
}

export async function listDeletedCourses(
  database: DatabaseExecutor,
  options: {
    limit: number;
    cursor?: { scheduledFor: Date; courseId: string };
  },
) {
  let query = database
    .selectFrom("courses")
    .innerJoin(
      "course_deletion_jobs",
      "course_deletion_jobs.course_id",
      "courses.id",
    )
    .select([
      "courses.id",
      "courses.slug",
      "courses.title",
      "courses.status",
      "courses.creator_id",
      "courses.deleted_at",
      "course_deletion_jobs.scheduled_for as purge_at",
      "course_deletion_jobs.status as purge_state",
      "course_deletion_jobs.attempt_count as purge_attempts",
      "course_deletion_jobs.last_error as last_purge_error",
    ])
    .where("courses.deleted_at", "is not", null);

  if (options.cursor) {
    const { scheduledFor, courseId } = options.cursor;
    query = query.where((eb) =>
      eb.or([
        eb("course_deletion_jobs.scheduled_for", "<", scheduledFor),
        eb.and([
          eb("course_deletion_jobs.scheduled_for", "=", scheduledFor),
          eb("courses.id", "<", courseId),
        ]),
      ]),
    );
  }

  return await query
    .orderBy("course_deletion_jobs.scheduled_for", "desc")
    .orderBy("courses.id", "desc")
    .limit(options.limit + 1)
    .execute();
}

export async function claimDueCourseDeletionJobs(
  database: DatabaseExecutor,
  now: Date,
  leaseUntil: Date,
  limit: number,
) {
  return await database.transaction().execute(async (trx) => {
    const jobs = await trx
      .selectFrom("course_deletion_jobs")
      .select(["id", "course_id"])
      .where((eb) =>
        eb.or([
          eb.and([
            eb("status", "in", CLAIMABLE_STATUSES),
            eb.or([
              eb("next_attempt_at", "is", null),
              eb("next_attempt_at", "<=", now),
            ]),
            eb("scheduled_for", "<=", now),
          ]),
          eb.and([
            eb("status", "=", "processing"),
            eb("lease_until", "<=", now),
          ]),
        ]),
      )
      .orderBy("scheduled_for", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();

    if (jobs.length === 0) {
      return [];
    }

    const jobIds = jobs.map((job) => job.id);
    return await trx
      .updateTable("course_deletion_jobs")
      .set({
        status: "processing",
        attempt_count: sql<number>`attempt_count + 1`,
        lease_until: leaseUntil,
        last_error: null,
        updated_at: now,
      })
      .where("id", "in", jobIds)
      .returning(["id", "course_id", "attempt_count"])
      .execute();
  });
}

export async function markCourseDeletionJobFailed(
  database: DatabaseExecutor,
  jobId: string,
  now: Date,
  nextAttemptAt: Date,
  error: string,
) {
  await database
    .updateTable("course_deletion_jobs")
    .set({
      status: "failed",
      next_attempt_at: nextAttemptAt,
      lease_until: null,
      last_error: error,
      updated_at: now,
    })
    .where("id", "=", jobId)
    .where("status", "=", "processing")
    .execute();
}

export async function listCourseMediaAssetIds(
  database: DatabaseExecutor,
  courseId: string,
) {
  const course = await database
    .selectFrom("courses")
    .select(["thumbnail_media_id", "trailer_media_id"])
    .where("id", "=", courseId)
    .executeTakeFirst();
  const lessons = await database
    .selectFrom("course_lessons")
    .select("content_media_id")
    .where("course_id", "=", courseId)
    .execute();
  const resources = await database
    .selectFrom("lesson_resources")
    .innerJoin(
      "course_lessons",
      "course_lessons.id",
      "lesson_resources.lesson_id",
    )
    .select("lesson_resources.media_asset_id")
    .where("course_lessons.course_id", "=", courseId)
    .execute();

  return [
    course?.thumbnail_media_id,
    course?.trailer_media_id,
    ...lessons.map((lesson) => lesson.content_media_id),
    ...resources.map((resource) => resource.media_asset_id),
  ]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, all) => all.indexOf(id) === index);
}

/**
 * Finds media used by another course, including another course in the
 * recovery bin. Those assets must survive this course's purge.
 */
export async function findMediaAssetIdsReferencedByOtherCourses(
  database: DatabaseExecutor,
  mediaIds: string[],
  excludedCourseId: string,
) {
  if (mediaIds.length === 0) {
    return [];
  }

  const referenced = new Set<string>();
  const courseReferences = await database
    .selectFrom("courses")
    .select(["thumbnail_media_id", "trailer_media_id"])
    .where("id", "!=", excludedCourseId)
    .where((eb) =>
      eb.or([
        eb("thumbnail_media_id", "in", mediaIds),
        eb("trailer_media_id", "in", mediaIds),
      ]),
    )
    .execute();
  const lessonReferences = await database
    .selectFrom("course_lessons")
    .select("content_media_id")
    .where("course_id", "!=", excludedCourseId)
    .where("content_media_id", "in", mediaIds)
    .execute();
  const resourceReferences = await database
    .selectFrom("lesson_resources")
    .innerJoin(
      "course_lessons",
      "course_lessons.id",
      "lesson_resources.lesson_id",
    )
    .select("lesson_resources.media_asset_id")
    .where("course_lessons.course_id", "!=", excludedCourseId)
    .where("lesson_resources.media_asset_id", "in", mediaIds)
    .execute();

  for (const row of courseReferences) {
    if (row.thumbnail_media_id) referenced.add(row.thumbnail_media_id);
    if (row.trailer_media_id) referenced.add(row.trailer_media_id);
  }
  for (const row of lessonReferences) {
    if (row.content_media_id) referenced.add(row.content_media_id);
  }
  for (const row of resourceReferences) {
    referenced.add(row.media_asset_id);
  }

  return [...referenced];
}

export async function insertCourseDeletionStorageItems(
  database: DatabaseExecutor,
  values: Array<{
    id: string;
    course_id: string;
    deletion_job_id: string;
    storage_key: string;
    delete_mode: "object" | "prefix";
    created_at: Date;
    updated_at: Date;
  }>,
) {
  if (values.length === 0) {
    return;
  }

  await database
    .insertInto("course_deletion_storage_items")
    .values(values.map((value) => ({ ...value, status: "scheduled" as const })))
    .execute();
}

export async function claimDueCourseDeletionStorageItems(
  database: DatabaseExecutor,
  now: Date,
  leaseUntil: Date,
  limit: number,
) {
  return await database.transaction().execute(async (trx) => {
    const items = await trx
      .selectFrom("course_deletion_storage_items")
      .select(["id", "storage_key", "delete_mode"])
      .where((eb) =>
        eb.or([
          eb.and([
            eb("status", "in", ["scheduled", "failed"]),
            eb.or([
              eb("next_attempt_at", "is", null),
              eb("next_attempt_at", "<=", now),
            ]),
          ]),
          eb.and([
            eb("status", "=", "processing"),
            eb("lease_until", "<=", now),
          ]),
        ]),
      )
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();

    if (items.length === 0) {
      return [];
    }

    const itemIds = items.map((item) => item.id);
    return await trx
      .updateTable("course_deletion_storage_items")
      .set({
        status: "processing",
        attempt_count: sql<number>`attempt_count + 1`,
        lease_until: leaseUntil,
        last_error: null,
        updated_at: now,
      })
      .where("id", "in", itemIds)
      .returning(["id", "storage_key", "delete_mode", "attempt_count"])
      .execute();
  });
}

export async function deleteCourseDeletionStorageItem(
  database: DatabaseExecutor,
  itemId: string,
) {
  await database
    .deleteFrom("course_deletion_storage_items")
    .where("id", "=", itemId)
    .execute();
}

export async function markCourseDeletionStorageItemFailed(
  database: DatabaseExecutor,
  itemId: string,
  now: Date,
  nextAttemptAt: Date,
  error: string,
) {
  await database
    .updateTable("course_deletion_storage_items")
    .set({
      status: "failed",
      next_attempt_at: nextAttemptAt,
      lease_until: null,
      last_error: error,
      updated_at: now,
    })
    .where("id", "=", itemId)
    .where("status", "=", "processing")
    .execute();
}

export async function restoreCourseAndCancelDeletion(
  database: DatabaseExecutor,
  courseId: string,
  now: Date,
) {
  return await database.transaction().execute(async (trx) => {
    const job = await findCourseDeletionJobForUpdate(trx, courseId);
    if (!job) {
      return { course: undefined, jobStatus: undefined };
    }

    if (job.status === "processing") {
      return { course: undefined, jobStatus: job.status };
    }

    const course = await trx
      .updateTable("courses")
      .set({
        deleted_at: null,
        updated_at: now,
        version: sql<number>`version + 1`,
      })
      .where("id", "=", courseId)
      .where("deleted_at", "is not", null)
      .returningAll()
      .executeTakeFirst();

    if (!course) {
      return { course: undefined, jobStatus: job.status };
    }

    await trx
      .deleteFrom("course_deletion_jobs")
      .where("id", "=", job.id)
      .execute();

    return { course, jobStatus: job.status };
  });
}

export async function hardDeleteCourse(
  database: DatabaseExecutor,
  courseId: string,
) {
  const result = await database
    .deleteFrom("courses")
    .where("id", "=", courseId)
    .where("deleted_at", "is not", null)
    .executeTakeFirst();

  return result.numDeletedRows > 0n;
}
