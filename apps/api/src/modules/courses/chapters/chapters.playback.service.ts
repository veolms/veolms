import type { DatabaseExecutor } from "@veolms/database";
import * as chaptersRepo from "./chapters.repository.ts";

/**
 * Read-only chapter access for an already-authorized playback request.
 * Authorization belongs to the caller's playback flow; this service only
 * reuses the chapter repository and preserves its deterministic ordering.
 */
export async function listLessonChaptersForPlayback(
  database: DatabaseExecutor,
  lessonId: string,
) {
  return await chaptersRepo.listChapters(database, lessonId);
}
