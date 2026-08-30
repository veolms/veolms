import crypto from "node:crypto";
import { z } from "zod";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { Course, DeletedCoursesQuery } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as courseRepo from "../course/course.repository.ts";
import {
  createMediaRetentionService,
  type MediaRetentionService,
} from "../../media/index.ts";
import * as deletionRepo from "./course-deletion.repository.ts";

export const COURSE_DELETION_RETENTION_DAYS = 30;
export const COURSE_DELETION_BATCH_SIZE = 100;
const COURSE_DELETION_RETENTION_MS =
  COURSE_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const COURSE_DELETION_LEASE_MS = 15 * 60 * 1000;
const COURSE_DELETION_MAX_BACKOFF_MS = 60 * 60 * 1000;

const cursorSchema = z.object({
  scheduledFor: z.iso.datetime(),
  courseId: z.uuid(),
});

function toCourseResponse(course: Selectable<Database["courses"]>): Course {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    shortDescription: course.short_description,
    description: course.description,
    difficulty: course.difficulty,
    status: course.status,
    creatorId: course.creator_id,
    categoryId: course.category_id,
    thumbnailMediaId: course.thumbnail_media_id,
    trailerMediaId: course.trailer_media_id,
    instructorAlias: course.instructor_alias,
    version: course.version,
    createdAt: course.created_at.toISOString(),
    updatedAt: course.updated_at.toISOString(),
    publishedAt: course.published_at?.toISOString() ?? null,
  };
}

function encodeCursor(scheduledFor: Date, courseId: string): string {
  return Buffer.from(
    JSON.stringify({
      scheduledFor: scheduledFor.toISOString(),
      courseId,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    return {
      scheduledFor: new Date(parsed.scheduledFor),
      courseId: parsed.courseId,
    };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "The cursor is invalid.");
  }
}

function getPurgeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Purge failed.";
  return message.slice(0, 2_000);
}

function getRetryDelayMs(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 10);
  return Math.min(60_000 * 2 ** exponent, COURSE_DELETION_MAX_BACKOFF_MS);
}

export interface CourseDeletionServiceOptions {
  database: Kysely<Database>;
  storage: S3StorageService;
  mediaRetentionService?: MediaRetentionService;
}

export function createCourseDeletionService({
  database,
  storage,
  mediaRetentionService = createMediaRetentionService({ database }),
}: CourseDeletionServiceOptions) {
  async function scheduleCourseDeletion(courseId: string, creatorId: string) {
    const result = await database.transaction().execute(async (trx) => {
      const course = await deletionRepo.findCourseIncludingDeleted(
        trx,
        courseId,
        true,
      );

      if (!course) {
        throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
      }
      if (course.creator_id !== creatorId) {
        throw new AppError(403, "FORBIDDEN", "Unauthorized course access.");
      }
      if (course.deleted_at) {
        throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
      }

      const now = new Date();
      const purgeAt = new Date(now.getTime() + COURSE_DELETION_RETENTION_MS);
      const updated = await courseRepo.softDeleteCourse(trx, courseId, now);

      if (updated.numUpdatedRows === 0n) {
        throw new AppError(
          409,
          "COURSE_STATE_CHANGED",
          "Course was already deleted.",
        );
      }

      await deletionRepo.insertCourseDeletionJob(trx, {
        id: crypto.randomUUID(),
        course_id: courseId,
        scheduled_for: purgeAt,
        status: "scheduled",
        created_at: now,
        updated_at: now,
      });

      return purgeAt;
    });

    return { purgeAt: result.toISOString() };
  }

  async function listDeletedCourses({ limit, cursor }: DeletedCoursesQuery) {
    const decodedCursor = cursor ? decodeCursor(cursor) : undefined;
    const rows = await deletionRepo.listDeletedCourses(database, {
      limit,
      cursor: decodedCursor,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      courses: page.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        status: row.status,
        creatorId: row.creator_id,
        deletedAt: row.deleted_at!.toISOString(),
        purgeAt: row.purge_at.toISOString(),
        purgeState: row.purge_state,
        purgeAttempts: row.purge_attempts,
        lastPurgeError: row.last_purge_error,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.purge_at, last.id) : null,
    };
  }

  async function restoreCourse(courseId: string) {
    const result = await deletionRepo.restoreCourseAndCancelDeletion(
      database,
      courseId,
      new Date(),
    );

    if (result.jobStatus === "processing") {
      throw new AppError(
        409,
        "COURSE_PURGE_IN_PROGRESS",
        "Course purge is already in progress and cannot be restored.",
      );
    }
    if (!result.course) {
      throw new AppError(
        404,
        "DELETED_COURSE_NOT_FOUND",
        "Deleted course not found.",
      );
    }

    return { course: toCourseResponse(result.course) };
  }

  async function prepareCoursePurge(
    jobId: string,
    courseId: string,
    now: Date,
  ) {
    return await database.transaction().execute(async (trx) => {
      const job = await deletionRepo.findCourseDeletionJobForUpdate(
        trx,
        courseId,
      );
      if (!job || job.id !== jobId || job.status !== "processing") {
        return false;
      }

      const course = await deletionRepo.findCourseIncludingDeleted(
        trx,
        courseId,
        true,
      );
      if (!course || !course.deleted_at || job.scheduled_for > now) {
        return false;
      }

      // Lock media rows before checking references. Existing foreign-key
      // writes that try to attach one of these assets will wait, then fail if
      // this transaction removes an unshared asset.
      const mediaIds = await deletionRepo.listCourseMediaAssetIds(
        trx,
        courseId,
      );
      const lockedMedia = await mediaRetentionService.getMediaAssetsForDeletion(
        mediaIds,
        trx,
      );
      const lockedMediaIds = lockedMedia.map((media) => media.id);
      const sharedMediaIds = new Set(
        await deletionRepo.findMediaAssetIdsReferencedByOtherCourses(
          trx,
          lockedMediaIds,
          courseId,
        ),
      );
      const removableMediaIds = lockedMediaIds.filter(
        (mediaId) => !sharedMediaIds.has(mediaId),
      );

      if (removableMediaIds.length > 0) {
        const storageObjects =
          await mediaRetentionService.getStorageObjectsForMedia(
            removableMediaIds,
            trx,
          );
        const uniqueStorageObjects = new Map(
          storageObjects.map((object) => [
            `${object.deleteMode}:${object.storageKey}`,
            object,
          ]),
        );

        await deletionRepo.insertCourseDeletionStorageItems(
          trx,
          [...uniqueStorageObjects.values()].map((object) => ({
            id: crypto.randomUUID(),
            course_id: courseId,
            deletion_job_id: jobId,
            storage_key: object.storageKey,
            delete_mode: object.deleteMode,
            created_at: now,
            updated_at: now,
          })),
        );
        await mediaRetentionService.deleteMediaAssets(removableMediaIds, trx);
      }

      return await deletionRepo.hardDeleteCourse(trx, courseId);
    });
  }

  async function purgeStorageItems({
    now,
    batchSize,
  }: {
    now: Date;
    batchSize: number;
  }) {
    const claimedItems = await deletionRepo.claimDueCourseDeletionStorageItems(
      database,
      now,
      new Date(now.getTime() + COURSE_DELETION_LEASE_MS),
      batchSize,
    );
    let completed = 0;
    let failed = 0;

    for (const item of claimedItems) {
      try {
        if (item.delete_mode === "prefix") {
          await storage.deletePrefix(item.storage_key);
        } else {
          await storage.deleteObject(item.storage_key);
        }
        await deletionRepo.deleteCourseDeletionStorageItem(database, item.id);
        completed++;
      } catch (error) {
        failed++;
        await deletionRepo.markCourseDeletionStorageItemFailed(
          database,
          item.id,
          now,
          new Date(now.getTime() + getRetryDelayMs(item.attempt_count)),
          getPurgeError(error),
        );
      }
    }

    return {
      claimed: claimedItems.length,
      completed,
      failed,
    };
  }

  async function purgeDueCourses({
    now = new Date(),
    batchSize = COURSE_DELETION_BATCH_SIZE,
  }: {
    now?: Date;
    batchSize?: number;
  } = {}) {
    const claimedJobs = await deletionRepo.claimDueCourseDeletionJobs(
      database,
      now,
      new Date(now.getTime() + COURSE_DELETION_LEASE_MS),
      batchSize,
    );

    let completed = 0;
    let failed = 0;

    for (const job of claimedJobs) {
      try {
        const deleted = await prepareCoursePurge(job.id, job.course_id, now);
        if (deleted) {
          completed++;
        }
      } catch (error) {
        failed++;
        const nextAttemptAt = new Date(
          now.getTime() + getRetryDelayMs(job.attempt_count),
        );
        await deletionRepo.markCourseDeletionJobFailed(
          database,
          job.id,
          now,
          nextAttemptAt,
          getPurgeError(error),
        );
      }
    }

    const storage = await purgeStorageItems({ now, batchSize });

    return {
      claimed: claimedJobs.length,
      completed,
      failed,
      storage,
    };
  }

  return {
    scheduleCourseDeletion,
    listDeletedCourses,
    restoreCourse,
    purgeDueCourses,
  };
}

export type CourseDeletionService = ReturnType<
  typeof createCourseDeletionService
>;
