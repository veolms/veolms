import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { AppServices } from "../../../services/index.ts";
import {
  createCourseDeletionService,
  type CourseDeletionService,
} from "../lifecycle/course-deletion.service.ts";

export interface CourseBinServiceOptions {
  database: Kysely<Database>;
  storage: S3StorageService;
  services: AppServices;
  deletionService?: CourseDeletionService;
}

export function createCourseBinService({
  database,
  storage,
  services,
  deletionService = createCourseDeletionService({ database, storage }),
}: CourseBinServiceOptions) {
  async function listDeletedCourses(limit: number, cursor?: string) {
    return await deletionService.listDeletedCourses({ limit, cursor });
  }

  async function restoreCourse(courseId: string) {
    const result = await deletionService.restoreCourse(courseId);
    if (result.course.status === "published") {
      services.courseStaticPages.requestRefresh({
        courseId: result.course.id,
        courseSlug: result.course.slug,
      });
    }
    return result;
  }

  return { listDeletedCourses, restoreCourse };
}

export type CourseBinService = ReturnType<typeof createCourseBinService>;
