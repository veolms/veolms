import type { Permission } from "@veolms/contracts";
import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import {
  COURSE_INCLUDE_PALETTE,
  DEFAULT_COURSE_INCLUDES,
  MAX_COURSE_INCLUDES,
  type CreateCourseIncludeRequest,
  type UpdateCourseIncludeRequest,
  type CourseIncludeItem,
} from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import { AppError } from "../../../lib/errors.ts";
import * as includesRepo from "./includes.repository.ts";
import {
  getCourseAndVerifyOwner as verifyCourseOwner,
  getCourseForViewer,
} from "../shared/courses.utils.ts";

export interface IncludesServiceOptions {
  database: Kysely<Database>;
}

export function createIncludesService({ database }: IncludesServiceOptions) {
  function getCourseAndVerifyOwner(
    courseId: string,
    creatorId: string,
    userRoles: readonly string[] | undefined,
    permission: Permission,
  ) {
    return verifyCourseOwner(
      database,
      courseId,
      creatorId,
      userRoles,
      permission,
    );
  }

  function formatInclude(row: {
    id: string;
    text: string;
    position: number;
    detail: string | null;
    icon: string | null;
    color: string | null;
    kind: "custom" | "video";
  }): CourseIncludeItem {
    return {
      id: row.id,
      text: row.text,
      position: row.position,
      detail: row.detail,
      icon: row.icon,
      color: row.color,
      kind: row.kind,
    };
  }

  async function createCourseInclude(
    courseId: string,
    creatorId: string,
    payload: CreateCourseIncludeRequest,
    userRoles?: readonly string[],
  ): Promise<CourseIncludeItem> {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    if (
      (await includesRepo.countIncludes(database, courseId)) >=
      MAX_COURSE_INCLUDES
    ) {
      throw new AppError(
        400,
        "TOO_MANY_INCLUDES",
        `A course can list at most ${MAX_COURSE_INCLUDES} things it includes.`,
      );
    }

    let position = payload.position;
    if (position === undefined) {
      const maxPos = await includesRepo.findMaxIncludePosition(
        database,
        courseId,
      );
      position = (maxPos?.max ?? -1) + 1;
    }

    const includeId = crypto.randomUUID();
    const now = new Date();
    const row = {
      id: includeId,
      text: payload.text,
      detail: payload.detail?.trim() || null,
      icon: payload.icon ?? "check-circle",
      color: payload.color ?? COURSE_INCLUDE_PALETTE[0],
      kind: payload.kind ?? "custom",
      position,
    };

    await includesRepo.insertInclude(database, {
      ...row,
      course_id: courseId,
      created_at: now,
      updated_at: now,
    });

    return formatInclude(row);
  }

  async function listCourseIncludes(
    courseId: string,
    viewer?: { id: string; roles?: readonly string[] } | null,
  ): Promise<CourseIncludeItem[]> {
    // This list is public for published courses, but the route had no check
    // at all, so the includes of any draft could be read by course id.
    await getCourseForViewer(database, courseId, viewer);
    return await listIncludesForAuthorizedCourse(courseId);
  }

  /**
   * The same list without the viewer check, for callers that have already
   * decided the viewer may see this course (the editor and the overview).
   * Going through listCourseIncludes there re-read the course and, with no
   * viewer to pass, answered 404 for every draft.
   */
  async function listIncludesForAuthorizedCourse(
    courseId: string,
  ): Promise<CourseIncludeItem[]> {
    const rows = await includesRepo.findIncludesByCourseId(database, courseId);
    return rows.map(formatInclude);
  }

  async function updateCourseInclude(
    courseId: string,
    includeId: string,
    creatorId: string,
    payload: UpdateCourseIncludeRequest,
    userRoles?: readonly string[],
  ): Promise<CourseIncludeItem> {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    const existing = await includesRepo.findIncludeById(
      database,
      includeId,
      courseId,
    );
    if (!existing) {
      throw new AppError(
        404,
        "INCLUDE_NOT_FOUND",
        "Course include item not found.",
      );
    }

    const now = new Date();
    await includesRepo.updateInclude(database, includeId, courseId, {
      text: payload.text,
      ...(payload.detail !== undefined
        ? { detail: payload.detail?.trim() || null }
        : {}),
      icon: payload.icon,
      color: payload.color,
      position: payload.position,
      updated_at: now,
    });

    const updated = await includesRepo.findIncludeById(
      database,
      includeId,
      courseId,
    );
    return formatInclude(updated!);
  }

  async function deleteCourseInclude(
    courseId: string,
    includeId: string,
    creatorId: string,
    userRoles?: readonly string[],
  ): Promise<{ success: boolean }> {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    const existing = await includesRepo.findIncludeById(
      database,
      includeId,
      courseId,
    );
    if (!existing) {
      throw new AppError(
        404,
        "INCLUDE_NOT_FOUND",
        "Course include item not found.",
      );
    }

    await includesRepo.deleteInclude(database, includeId, courseId);
    return { success: true };
  }

  async function reorderCourseIncludes(
    courseId: string,
    creatorId: string,
    orderedIds: string[],
    userRoles?: readonly string[],
  ): Promise<{ success: boolean }> {
    await getCourseAndVerifyOwner(
      courseId,
      creatorId,
      userRoles,
      "course.details.update",
    );

    const currentItems = await includesRepo.findIncludesByCourseId(
      database,
      courseId,
    );
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    if (
      currentItems.length !== orderedIds.length ||
      !orderedIds.every((id) => currentItemIds.has(id))
    ) {
      throw new AppError(
        400,
        "INVALID_INCLUDES_LIST",
        "Ordered include IDs list does not match this course's include items.",
      );
    }

    await database.transaction().execute(async (trx) => {
      const now = new Date();
      for (let i = 0; i < orderedIds.length; i++) {
        await includesRepo.updateIncludePosition(
          trx,
          orderedIds[i]!,
          courseId,
          i,
          now,
        );
      }
    });

    return { success: true };
  }

  return {
    createCourseInclude,
    listCourseIncludes,
    listIncludesForAuthorizedCourse,
    updateCourseInclude,
    deleteCourseInclude,
    reorderCourseIncludes,
  };
}

/**
 * A new course's standard lines (`DEFAULT_COURSE_INCLUDES`), written with the
 * caller's executor so they go in with the course.
 */
export async function seedDefaultIncludes(
  database: DatabaseExecutor,
  courseId: string,
) {
  const now = new Date();
  await includesRepo.insertIncludes(
    database,
    DEFAULT_COURSE_INCLUDES.map((line, position) => ({
      id: crypto.randomUUID(),
      course_id: courseId,
      text: line.text,
      detail: line.detail,
      icon: line.icon,
      color: line.color,
      kind: line.kind,
      position,
      created_at: now,
      updated_at: now,
    })),
  );
}

export type IncludesService = ReturnType<typeof createIncludesService>;
