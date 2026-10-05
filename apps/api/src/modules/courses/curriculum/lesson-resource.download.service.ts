import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import * as curriculumRepo from "./curriculum.repository.ts";

/**
 * Read-only resource access for an already-authorized lesson download.
 * Authorization belongs to the caller, which has resolved the lesson through
 * the playback access rules; this only confirms the resource is a live
 * attachment of that lesson.
 */
export async function findLessonResourceForDownload(
  database: Kysely<Database>,
  lessonId: string,
  resourceId: string,
) {
  return await curriculumRepo.findResourceByLessonId(
    database,
    resourceId,
    lessonId,
  );
}
