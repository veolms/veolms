import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import {
  createCourseDeletionService,
  type CourseDeletionService,
} from "../lifecycle/course-deletion.service.ts";

export interface CourseBinServiceOptions {
  database: Kysely<Database>;
  storage: S3StorageService;
  deletionService?: CourseDeletionService;
}

export function createCourseBinService({
  database,
  storage,
  deletionService = createCourseDeletionService({ database, storage }),
}: CourseBinServiceOptions) {
  async function listDeletedCourses(limit: number, cursor?: string) {
    return await deletionService.listDeletedCourses({ limit, cursor });
  }

  async function restoreCourse(courseId: string) {
    return await deletionService.restoreCourse(courseId);
  }

  return { listDeletedCourses, restoreCourse };
}

export type CourseBinService = ReturnType<typeof createCourseBinService>;
