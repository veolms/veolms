import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  CreateCourseIncludeRequest,
  UpdateCourseIncludeRequest,
  CourseIncludeItem,
} from "@veolms/contracts";
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
    userRoles?: readonly string[],
  ) {
    return verifyCourseOwner(database, courseId, creatorId, userRoles);
  }

  function formatInclude(row: {
    id: string;
    text: string;
    position: number;
  }): CourseIncludeItem {
    return {
      id: row.id,
      text: row.text,
      position: row.position,
    };
  }

  async function createCourseInclude(
    courseId: string,
    creatorId: string,
    payload: CreateCourseIncludeRequest,
    userRoles?: readonly string[],
  ): Promise<CourseIncludeItem> {
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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

    await includesRepo.insertInclude(database, {
      id: includeId,
      course_id: courseId,
      text: payload.text,
      icon: payload.icon ?? null,
      position,
      created_at: now,
      updated_at: now,
    });

    return formatInclude({ id: includeId, text: payload.text, position });
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
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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
      icon: payload.icon,
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
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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
    await getCourseAndVerifyOwner(courseId, creatorId, userRoles);

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

export type IncludesService = ReturnType<typeof createIncludesService>;
