import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { YoutubeImportStatus } from "@veolms/contracts";
import type { AppServices } from "../../../services/index.ts";
import * as importRepo from "./youtube-import.repository.ts";

/** Where an import's output is stored. Imports are always protected. */
export function outputPrefixFor(mediaId: string): string {
  return `protected/transcoded/${mediaId}`;
}

/**
 * Stops an import that has not finished. One no worker holds right now
 * (queued, or waiting out a retry delay) is cancelled here and its partial
 * output removed; one a worker holds is asked to stop, and that worker
 * cleans up what it wrote. Returns the status after.
 */
export async function cancelImportJob(
  database: Kysely<Database>,
  services: AppServices,
  job: { id: string; media_id: string; status: YoutubeImportStatus },
): Promise<YoutubeImportStatus> {
  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return job.status;
  }
  const unclaimed = await database.transaction().execute(async (trx) => {
    const cancelled = await importRepo.cancelUnclaimedImportJob(trx, job.id);
    if (cancelled) {
      await importRepo.setImportMediaStatus(trx, job.media_id, "failed");
    }
    return cancelled;
  });
  if (unclaimed) {
    // An earlier attempt may have uploaded part of the output or (with a
    // plugin packager) stored keys; no worker will clean those up now.
    // Its scratch folder is removed by the worker's sweep.
    if (unclaimed.started) {
      await services.storage
        .deletePrefix(`${outputPrefixFor(job.media_id)}/`)
        .catch(() => {});
      await services.mediaImport
        .getPackager()
        ?.discard?.(job.media_id)
        .catch(() => {});
    }
    return "cancelled";
  }
  await importRepo.requestImportCancel(database, job.id);
  return job.status;
}

/**
 * A lesson was deleted: its unfinished import has nowhere to go, so it is
 * cancelled rather than left to finish as a video nothing uses. A finished
 * import's video stays with the deleted lesson, like an uploaded one.
 */
export async function cancelLessonYoutubeImports(
  database: Kysely<Database>,
  services: AppServices,
  lessonId: string,
): Promise<void> {
  const job = await importRepo.findOpenImportForLesson(database, lessonId);
  if (job) await cancelImportJob(database, services, job);
}
