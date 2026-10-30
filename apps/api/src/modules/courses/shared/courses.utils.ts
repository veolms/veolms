import type { Kysely, UpdateResult } from "kysely";
import type { Database, DatabaseExecutor } from "@veolms/database";
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

import type { Permission } from "@veolms/contracts";
import { ADMIN_ROLE } from "../../auth/index.ts";
import { createAccessService } from "../../access/index.ts";
import { canActOnCourse } from "../../authorization/index.ts";

const accessService = createAccessService();

/**
 * The single course-management rule: an admin manages every course, anyone
 * else manages only the courses they created. Holding the instructor role is
 * NOT enough — it used to be, which let any instructor edit (and re-price)
 * every other instructor's course.
 */
export function canManageCourse(
  course: { creator_id: string | null },
  userId: string | null | undefined,
  userRoles?: readonly string[],
): boolean {
  if (userRoles?.includes(ADMIN_ROLE)) return true;
  return Boolean(userId) && course.creator_id === userId;
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
 *
 * `permission` is what the action needs. Someone who did not create the
 * course passes when they hold it through a role that reaches every course
 * (a course manager, a content editor); an instructor's course permissions
 * reach only their own courses, so instructors still cannot touch others'.
 */
export async function getCourseAndVerifyOwner(
  database: Kysely<Database>,
  courseId: string,
  userId: string,
  userRoles?: readonly string[],
  permission?: Permission,
) {
  const course = await courseRepo.findCourseById(database, courseId);
  if (!course) {
    throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
  }
  if (
    !(await mayManageCourse(database, course, userId, userRoles, permission))
  ) {
    throw new AppError(403, "FORBIDDEN", "Unauthorized course access.");
  }
  return course;
}

/**
 * `canManageCourse`, widened by permission: admin or the creator, or anyone
 * holding `permission` through a role that reaches every course.
 */
export async function mayManageCourse(
  database: DatabaseExecutor,
  course: { id: string; creator_id: string | null },
  userId: string | null | undefined,
  userRoles: readonly string[] | undefined,
  permission?: Permission,
): Promise<boolean> {
  if (canManageCourse(course, userId, userRoles)) return true;
  if (!permission || !userId) return false;
  return await canActOnCourse(database, { userId, permission, course });
}

/**
 * Loads a course for a read that is public once the course is published.
 * A draft is visible only to whoever may manage it, an archived course to
 * them and to learners who hold access to it; for everyone else they answer
 * exactly like a missing course.
 */
export async function getCourseForViewer(
  database: Kysely<Database>,
  courseId: string,
  viewer?: { id: string; roles?: readonly string[] } | null,
) {
  const course = await courseRepo.findCourseById(database, courseId);
  if (
    !course ||
    // A draft is open to whoever may manage it, and to reviewers who may
    // preview every course.
    (!(await mayManageCourse(
      database,
      course,
      viewer?.id,
      viewer?.roles,
      "course.preview",
    )) &&
      !(await accessService.isCourseOpenToLearner(
        database,
        viewer?.id,
        course,
      )))
  ) {
    throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
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
