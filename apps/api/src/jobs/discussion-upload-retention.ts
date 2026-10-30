import { createDatabase } from "@veolms/database";
import { S3StorageService } from "@veolms/storage";
import { config } from "../config.ts";
import { findIdsMentionedInCourseContent } from "../modules/courses/curriculum/course-content-reference.service.ts";
import { createDiscussionUploadStore } from "../modules/discussion-uploads/index.ts";
import { createAttachmentsRepository } from "../modules/learning/discussions/attachments/attachments.repository.ts";
import { createAttachmentsService } from "../modules/learning/discussions/attachments/attachments.service.ts";

/**
 * Removes discussion uploads that were never attached to a post.
 *
 * An upload is removed only when all of this holds: it is not attached to a
 * thread, reply or note; it is older than
 * DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS; and no post, note, lesson or
 * course text mentions it. Its row is kept, marked deleted.
 *
 * Without --apply the job changes nothing and reports what it would remove.
 * --limit=N caps how many uploads one run removes (default 1000).
 */
const JOB_NAME = "discussion-upload-retention";
const DAY_MS = 24 * 60 * 60 * 1000;

const apply = process.argv.includes("--apply");
const limitArgument = process.argv
  .find((argument) => argument.startsWith("--limit="))
  ?.slice("--limit=".length);
const limit = limitArgument ? Number(limitArgument) : 1000;

const database = createDatabase(config.DATABASE_URL);

try {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive whole number.");
  }

  // Without storage credentials the upload store works on the local disk
  // only. On a deployment that would record uploads as removed while their
  // files stayed in the bucket.
  if (
    apply &&
    config.NODE_ENV === "production" &&
    !(config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      "--apply needs the object storage credentials (STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY).",
    );
  }

  const storage = new S3StorageService({
    endpoint: config.STORAGE_ENDPOINT,
    requireVisibilityPrefix: true,
    region: config.STORAGE_REGION,
    accessKeyId: config.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
    bucket: config.STORAGE_BUCKET,
    forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
  });
  const service = createAttachmentsService(
    createAttachmentsRepository(),
    createDiscussionUploadStore(storage),
    storage,
  );

  const retentionDays = config.DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS;
  const result = await service.purgeAbandonedUploads(database, {
    olderThan: new Date(Date.now() - retentionDays * DAY_MS),
    apply,
    limit,
    findReferencedElsewhere: (attachmentIds) =>
      findIdsMentionedInCourseContent(database, attachmentIds),
  });

  process.stdout.write(
    `${JSON.stringify({
      job: JOB_NAME,
      mode: apply ? "apply" : "dry-run",
      retentionDays,
      ...result,
    })}\n`,
  );
  // Some files could not be removed; they are tried again next time.
  if (result.failed > 0) process.exitCode = 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      job: JOB_NAME,
      error: error instanceof Error ? error.message : "Unknown worker error",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
