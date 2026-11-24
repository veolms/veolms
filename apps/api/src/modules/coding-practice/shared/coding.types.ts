import type { Permission } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import type { AccessService } from "../../access/access.service.ts";
import type { AuthService } from "../../auth/index.ts";
import { hasAcademyPermission } from "../../authorization/index.ts";
import type { CourseService } from "../../courses/course/course.service.ts";
import { mayManageCourse } from "../../courses/shared/courses.utils.ts";
import type { LearningActivityCredit } from "../../learning-progress/index.ts";

export interface CodingServiceOptions {
  database: Kysely<Database>;
  getAcademyId: () => Promise<string | null>;
  authService: Pick<
    AuthService,
    "listUserDisplayNamesByIds" | "listUserNamesAndEmailsByIds"
  >;
  courseService: Pick<
    CourseService,
    "findCourseById" | "findLessonById" | "getCourseContent"
  >;
  accessService: AccessService;
  /** Counts practice time and solves into the learner's day. */
  activityCredit: LearningActivityCredit;
}

export interface CodingActor {
  id: string;
  roles: readonly string[];
}

export const isAdmin = (actor: CodingActor) =>
  actor.roles.some((role) => role.toLowerCase() === "admin");

/** The active academy's id; exercises cannot be authored without one. */
export async function requireAcademyId(
  options: Pick<CodingServiceOptions, "getAcademyId">,
) {
  const id = await options.getAcademyId();
  if (!id)
    throw new AppError(
      503,
      "ACADEMY_NOT_CONFIGURED",
      "The academy is not configured.",
    );
  return id;
}

/**
 * Who manages a course's coding lessons: an admin, the course's creator, or
 * anyone holding `permission` through a role that reaches the course.
 */
export async function assertCanManageCourse(
  database: Kysely<Database>,
  actor: CodingActor,
  course: { id: string; creator_id: string | null },
  permission: Permission,
) {
  if (
    await mayManageCourse(database, course, actor.id, actor.roles, permission)
  )
    return;
  throw new AppError(403, "FORBIDDEN", "You cannot manage this course.");
}

/**
 * Admin, or `permission` through a role that reaches every course: what lets
 * someone act on exercises they did not write.
 */
export async function reachesEveryExercise(
  database: Kysely<Database>,
  actor: CodingActor,
  permission: Permission,
): Promise<boolean> {
  if (isAdmin(actor)) return true;
  return await hasAcademyPermission(database, actor.id, permission);
}

export const CodingErrors = {
  exerciseNotFound: () =>
    new AppError(404, "CODING_EXERCISE_NOT_FOUND", "Exercise not found."),
  assignmentNotFound: () =>
    new AppError(
      404,
      "CODING_ASSIGNMENT_NOT_FOUND",
      "This lesson has no coding exercise.",
    ),
  versionChanged: () =>
    new AppError(
      409,
      "CODING_VERSION_CHANGED",
      "This exercise was updated. Reload the lesson to get the new tests; your code is kept.",
    ),
};
