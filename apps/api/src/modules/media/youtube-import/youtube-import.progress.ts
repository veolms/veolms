import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { VideoJobProgressResponse } from "@veolms/contracts";
import * as importRepo from "./youtube-import.repository.ts";

const IMPORT_FAILED_MESSAGE =
  "The YouTube import failed. Press Retry; if it keeps failing, the server log has the details.";

/**
 * The media progress stream's answer for a video still being imported
 * (it has no `video_jobs` row until the import finishes). Null when the
 * media is not an import.
 */
export async function findYoutubeImportProgress(
  database: Kysely<Database>,
  mediaId: string,
): Promise<VideoJobProgressResponse | null> {
  const progress = await importRepo.findImportProgressByMediaId(
    database,
    mediaId,
  );
  if (!progress) return null;
  const status =
    progress.status === "queued"
      ? "queued"
      : progress.status === "completed"
        ? "completed"
        : progress.status === "failed"
          ? "failed"
          : progress.status === "cancelled"
            ? "cancelled"
            : "processing";
  return {
    status,
    progressPercent:
      status === "completed"
        ? 100
        : Math.max(0, Math.min(99, Number(progress.progress_percent ?? 0))),
    error:
      status === "failed"
        ? (progress.stage_detail ?? IMPORT_FAILED_MESSAGE)
        : null,
    stage:
      status === "failed" || status === "cancelled"
        ? null
        : progress.stage_detail,
    source: "youtube",
  };
}
