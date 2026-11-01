import type { DatabaseExecutor } from "@veolms/database";

/** The lesson's subtitle tracks made for this video, by language. */
export async function listSubtitlesForMedia(
  database: DatabaseExecutor,
  lessonId: string,
  mediaAssetId: string,
) {
  return await database
    .selectFrom("lesson_subtitles")
    .select(["language", "label", "kind", "storage_key"])
    .where("lesson_id", "=", lessonId)
    .where("media_asset_id", "=", mediaAssetId)
    .orderBy("language", "asc")
    .execute();
}
