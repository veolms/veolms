import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { Permission } from "@veolms/contracts";
import type { PermissionCheckContext } from "./authorization.repository.ts";
import { checkPermission } from "./permission-cache.ts";

export interface CourseActionRequest {
  userId: string | null | undefined;
  permission: Permission;
  course: { id: string; creator_id: string | null };
}

type PermissionChecker = (
  context: PermissionCheckContext,
) => Promise<{ allowed: boolean }>;

/**
 * Whether a user may perform `permission` on one course. Replaces the
 * "owner or admin" checks:
 *
 * - on a course they created, any role granting the permission counts;
 * - on anyone else's course, only roles not limited to their holder's own
 *   courses count. Instructors hold course permissions platform-wide but
 *   must never act on another instructor's course.
 *
 * Admin passes both because it holds every permission.
 */
export async function canActOnCourseWith(
  check: PermissionChecker,
  { userId, permission, course }: CourseActionRequest,
): Promise<boolean> {
  if (!userId) return false;

  const result = await check({
    userId,
    permissionKey: permission,
    courseId: course.id,
    excludeOwnCoursesOnlyRoles: course.creator_id !== userId,
  });
  return result.allowed;
}

/**
 * Whether the user holds `permission` through a role that reaches every
 * course: what the old "is admin" checks meant on academy-wide lists
 * (every student, every coupon, every order). An instructor's own-course
 * role does not count, so their lists stay limited to their courses.
 */
export async function hasAcademyPermission(
  database: Executor,
  userId: string | null | undefined,
  permission: Permission,
): Promise<boolean> {
  if (!userId) return false;
  const result = await checkPermission(database, {
    userId,
    permissionKey: permission,
    excludeOwnCoursesOnlyRoles: true,
  });
  return result.allowed;
}

export function canActOnCourse(
  database: Executor,
  request: CourseActionRequest,
): Promise<boolean> {
  return canActOnCourseWith(
    (context) => checkPermission(database, context),
    request,
  );
}
