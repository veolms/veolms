import type { DatabaseExecutor } from "@veolms/database";
import * as subtitlesRepo from "./subtitles.repository.ts";

/**
 * Read-only subtitle access for an already-authorized playback request.
 * Authorization belongs to the caller's playback flow; tracks made for an
 * earlier video of the lesson are not returned.
 */
export async function listLessonSubtitlesForPlayback(
  database: DatabaseExecutor,
  lessonId: string,
  mediaAssetId: string,
) {
  return await subtitlesRepo.listSubtitlesForMedia(
    database,
    lessonId,
    mediaAssetId,
  );
}
