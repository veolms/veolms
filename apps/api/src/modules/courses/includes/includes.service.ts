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
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";

export interface IncludesServiceOptions {
  database: Kysely<Database>;
}

export function createIncludesService({ database }: IncludesServiceOptions) {
  function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    return verifyCourseOwner(database, courseId, creatorId);
  }

  function formatInclude(row: {
    id: string;
    course_id: string;
    text: string;
    icon: string | null;
    position: number;
    created_at: Date;
    updated_at: Date;
  }): CourseIncludeItem {
    return {
      id: row.id,
      courseId: row.course_id,
      text: row.text,
      icon: row.icon ?? null,
      position: row.position,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async function createCourseInclude(
    courseId: string,
    creatorId: string,
    payload: CreateCourseIncludeRequest,
  ): Promise<CourseIncludeItem> {
    await getCourseAndVerifyOwner(courseId, creatorId);

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

    return {
      id: includeId,
      courseId,
      text: payload.text,
      icon: payload.icon ?? null,
      position,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async function listCourseIncludes(
    courseId: string,
  ): Promise<CourseIncludeItem[]> {
    const rows = await includesRepo.findIncludesByCourseId(database, courseId);
    return rows.map(formatInclude);
  }

  async function getCourseInclude(
    courseId: string,
    includeId: string,
  ): Promise<CourseIncludeItem> {
    const row = await includesRepo.findIncludeById(database, includeId, courseId);
    if (!row) {
      throw new AppError(404, "INCLUDE_NOT_FOUND", "Course include item not found.");
    }
    return formatInclude(row);
  }

  async function updateCourseInclude(
    courseId: string,
    includeId: string,
    creatorId: string,
    payload: UpdateCourseIncludeRequest,
  ): Promise<CourseIncludeItem> {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const existing = await includesRepo.findIncludeById(
      database,
      includeId,
      courseId,
    );
    if (!existing) {
      throw new AppError(404, "INCLUDE_NOT_FOUND", "Course include item not found.");
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
  ): Promise<{ success: boolean }> {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const existing = await includesRepo.findIncludeById(
      database,
      includeId,
      courseId,
    );
    if (!existing) {
      throw new AppError(404, "INCLUDE_NOT_FOUND", "Course include item not found.");
    }

    await includesRepo.deleteInclude(database, includeId, courseId);
    return { success: true };
  }

  async function reorderCourseIncludes(
    courseId: string,
    creatorId: string,
    orderedIds: string[],
  ): Promise<{ success: boolean }> {
    await getCourseAndVerifyOwner(courseId, creatorId);

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
    getCourseInclude,
    updateCourseInclude,
    deleteCourseInclude,
    reorderCourseIncludes,
  };
}

export type IncludesService = ReturnType<typeof createIncludesService>;
