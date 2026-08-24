import type { Kysely, UpdateResult } from "kysely";
import type { Database } from "@veolms/database";
import { AppError } from "../../../lib/errors.ts";
import * as courseRepo from "../course/course.repository.ts";

/**
 * Helper to generate URL-safe slugs.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Verifies course existence and owner permissions. This is the single
 * ownership gate every course sub-service (course, curriculum, configuration,
 * lifecycle, media) must go through before touching a course or anything
 * scoped under it — duplicating this check per-service is how the section/
 * lesson-reorder IDORs happened: each copy only ever validated the top-level
 * `courseId`, leaving nested resource IDs (sectionId, lessonId, videoId)
 * unchecked. Callers still must scope any nested resource ID to the returned
 * course themselves (e.g. via findSectionById(id, courseId)).
 */
export async function getCourseAndVerifyOwner(
  database: Kysely<Database>,
  courseId: string,
  creatorId: string,
) {
  const course = await courseRepo.findCourseById(database, courseId);
  if (!course) {
    throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
  }
  if (course.creator_id !== creatorId) {
    throw new AppError(403, "FORBIDDEN", "Unauthorized course access.");
  }
  return course;
}

/**
 * Throws OPTIMISTIC_LOCK_CONFLICT if a version-guarded UPDATE matched zero
 * rows (e.g. the row's version moved between the read and the write). Every
 * caller of courseRepo.updateCourse must pass its result through this so a
 * lost write can never be reported back to the client as a 200/success.
 */
export function assertOptimisticUpdate(result: UpdateResult): void {
  if (result.numUpdatedRows === 0n) {
    throw new AppError(
      409,
      "OPTIMISTIC_LOCK_CONFLICT",
      "Course was modified by another request. Please reload and try again.",
    );
  }
}
