import { cacheTags, invalidateCache } from "@veolms/api-core";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { ReorderCoursesResponse } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as orderRepo from "./course-order.repository.ts";

export interface CourseOrderServiceOptions {
  database: Kysely<Database>;
  /** Builds the static home page and catalogue again. */
  staticPages?: { requestHomePageRefresh(): void } | undefined;
  repository?: Pick<
    typeof orderRepo,
    "lockOrderableCourseIds" | "writeCourseOrder"
  >;
  invalidate?: (tags: readonly string[]) => void;
}

/**
 * Whether `courseIds` names exactly the courses there are: each once, none
 * missing, none unknown. Ids are compared without regard to case.
 */
export function namesEveryCourse(
  courseIds: readonly string[],
  existingIds: readonly string[],
): boolean {
  if (courseIds.length !== existingIds.length) return false;
  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  const named = new Set(courseIds.map((id) => id.toLowerCase()));
  if (named.size !== courseIds.length) return false;
  for (const id of named) if (!existing.has(id)) return false;
  return true;
}

/**
 * The order an admin puts the courses in. It is the first key of every
 * course list (the catalogue, the home page rows, the learner's courses,
 * the admin's own list); each list keeps its own order for courses that
 * have no place.
 */
export function createCourseOrderService({
  database,
  staticPages,
  repository = orderRepo,
  invalidate = invalidateCache,
}: CourseOrderServiceOptions) {
  async function reorderCourses(
    courseIds: readonly string[],
  ): Promise<ReorderCoursesResponse> {
    await database.transaction().execute(async (trx) => {
      const existingIds = await repository.lockOrderableCourseIds(trx);
      // An order made from a stale list (a course added or binned since it
      // was loaded) would leave a course out; the admin reloads instead.
      if (!namesEveryCourse(courseIds, existingIds)) {
        throw new AppError(
          409,
          "COURSE_ORDER_STALE",
          "The course list changed since it was loaded. Reload and try again.",
        );
      }
      await repository.writeCourseOrder(trx, courseIds);
    });

    // Every cached list of courses, and the static pages that show them.
    invalidate([cacheTags.catalog]);
    staticPages?.requestHomePageRefresh();

    return {
      courses: courseIds.map((id, index) => ({ id, sortPosition: index })),
    };
  }

  return { reorderCourses };
}

export type CourseOrderService = ReturnType<typeof createCourseOrderService>;
